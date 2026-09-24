import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../src/prisma.js';
import { auth, permit } from '../src/middleware.js';

const r = Router();
r.use(auth, permit('ACCOUNTING_VIEW'));
const n = v => Number(v || 0);
const round2 = v => Math.round((n(v) + Number.EPSILON) * 100) / 100;
const d0 = s => s ? new Date(String(s) + 'T00:00:00') : null;
const d1 = s => s ? new Date(String(s) + 'T23:59:59.999') : null;
const ymd = d => new Date(d).toISOString().slice(0,10);

async function setting(key, fallback='') {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value || fallback;
}
async function meta(title, from, to) {
  return {
    company: await setting('COMPANY_NAME', process.env.COMPANY_NAME || 'DARILTWEENS NIGERIA LIMITED'),
    title,
    period: from || to ? `${from || 'Beginning'} to ${to || 'Current'}` : 'All periods',
    generatedAt: new Date(),
  };
}
function journalDateWhere(from,to){
  if(!from && !to) return {};
  return { journalDate: { ...(from ? { gte:d0(from) } : {}), ...(to ? { lte:d1(to) } : {}) } };
}
async function linesFor(from,to){
  return prisma.journalLine.findMany({
    where:{ journalEntry:{ status:'POSTED', ...journalDateWhere(from,to) } },
    include:{ account:true, journalEntry:true },
    orderBy:[{journalEntry:{journalDate:'asc'}},{journalEntry:{journalNo:'asc'}},{lineNo:'asc'}]
  });
}
function mapNet(lines){
  const m=new Map();
  for(const l of lines){
    if(!m.has(l.accountId))m.set(l.accountId,{account:l.account,debit:0,credit:0,net:0});
    const x=m.get(l.accountId);x.debit+=n(l.debit);x.credit+=n(l.credit);x.net=round2(x.debit-x.credit);
  }
  return m;
}
function naturalAmount(account,net){
  return ['LIABILITY','EQUITY','REVENUE'].includes(account.type) ? round2(-net) : round2(net);
}
function signedLabel(v){ return v >= 0 ? 'DR' : 'CR'; }
function sectionFor(a){
  const code=String(a.accountCode||''); const name=String(a.name||'').toLowerCase();
  if(a.type==='ASSET'){
    if(a.systemCode==='BANK' || /cash|bank/.test(name)) return 'Cash & Cash Equivalents';
    if(a.systemCode==='AR' || /receivable|debtor/.test(name)) return 'Trade & Other Receivables';
    if(a.systemCode==='INVENTORY' || /inventory|stock/.test(name)) return 'Inventories';
    if(/^15|^16|property|plant|equipment|vehicle|furniture|computer|asset/.test(code+' '+name)) return 'Non-Current Assets';
    return 'Other Current Assets';
  }
  if(a.type==='LIABILITY'){
    if(/^25|^26|loan|lease|long.?term/.test(code+' '+name)) return 'Non-Current Liabilities';
    if(a.systemCode==='AP' || /payable|creditor/.test(name)) return 'Trade & Other Payables';
    return 'Other Current Liabilities';
  }
  if(a.type==='EQUITY') return 'Equity';
  if(a.type==='REVENUE') return 'Revenue';
  if(a.type==='EXPENSE'){
    if(a.systemCode==='COGS' || /^5/.test(code)) return 'Cost of Sales';
    if(/tax/.test(name)) return 'Income Tax Expense';
    if(/finance|interest|bank charge/.test(name)) return 'Finance Costs';
    return 'Operating Expenses';
  }
  return 'Other';
}

async function trialBalanceData(from,to){
  const accounts=await prisma.chartAccount.findMany({where:{active:true},orderBy:{accountCode:'asc'}});
  const before=from ? await linesFor(null, ymd(new Date(d0(from).getTime()-1))) : [];
  const period=await linesFor(from,to);
  const bm=mapNet(before), pm=mapNet(period);
  const rows=accounts.map(a=>{
    const opening=round2(bm.get(a.id)?.net||0),debit=round2(pm.get(a.id)?.debit||0),credit=round2(pm.get(a.id)?.credit||0),closing=round2(opening+debit-credit);
    return {accountId:a.id,code:a.accountCode,account:a.name,type:a.type,opening,debit,credit,closing,openingSide:signedLabel(opening),closingSide:signedLabel(closing)};
  }).filter(x=>x.opening||x.debit||x.credit||x.closing);
  return {meta:await meta('Trial Balance',from,to),rows,totalDebit:round2(rows.reduce((s,x)=>s+x.debit,0)),totalCredit:round2(rows.reduce((s,x)=>s+x.credit,0)),closingDebit:round2(rows.reduce((s,x)=>s+Math.max(x.closing,0),0)),closingCredit:round2(rows.reduce((s,x)=>s+Math.max(-x.closing,0),0))};
}
async function profitLossData(from,to){
  const m=mapNet(await linesFor(from,to));
  const groups={Revenue:[], 'Cost of Sales':[], 'Operating Expenses':[], 'Finance Costs':[], 'Income Tax Expense':[]};
  for(const x of m.values()){
    if(!['REVENUE','EXPENSE'].includes(x.account.type))continue;
    const sec=sectionFor(x.account);const amount=naturalAmount(x.account,x.net);
    (groups[sec]||(groups[sec]=[])).push({code:x.account.accountCode,account:x.account.name,amount});
  }
  Object.values(groups).forEach(arr=>arr.sort((a,b)=>a.code.localeCompare(b.code)));
  const sum=k=>round2((groups[k]||[]).reduce((s,x)=>s+x.amount,0));
  const revenue=sum('Revenue'),cogs=sum('Cost of Sales'),gross=round2(revenue-cogs),opex=sum('Operating Expenses'),finance=sum('Finance Costs'),pbt=round2(gross-opex-finance),tax=sum('Income Tax Expense'),netProfit=round2(pbt-tax);
  return {meta:await meta('Profit & Loss Statement',from,to),groups,totals:{revenue,costOfSales:cogs,grossProfit:gross,operatingExpenses:opex,financeCosts:finance,profitBeforeTax:pbt,incomeTax:tax,netProfit}};
}
async function balanceSheetData(asOf){
  const to=asOf||ymd(new Date());const m=mapNet(await linesFor(null,to));
  const groups={'Cash & Cash Equivalents':[],'Trade & Other Receivables':[],Inventories:[],'Other Current Assets':[],'Non-Current Assets':[],'Trade & Other Payables':[],'Other Current Liabilities':[],'Non-Current Liabilities':[],Equity:[]};
  let cumulativeProfit=0;
  for(const x of m.values()){
    if(['REVENUE','EXPENSE'].includes(x.account.type)){cumulativeProfit += x.account.type==='REVENUE' ? -x.net : -x.net;continue;}
    const sec=sectionFor(x.account);if(!groups[sec])continue;groups[sec].push({code:x.account.accountCode,account:x.account.name,amount:naturalAmount(x.account,x.net)});
  }
  const pl=await profitLossData(null,to);cumulativeProfit=pl.totals.netProfit;
  groups.Equity.push({code:'',account:'Cumulative Earnings / Current Result',amount:cumulativeProfit,calculated:true});
  const sum=k=>round2(groups[k].reduce((s,x)=>s+x.amount,0));
  const currentAssets=round2(sum('Cash & Cash Equivalents')+sum('Trade & Other Receivables')+sum('Inventories')+sum('Other Current Assets'));
  const nonCurrentAssets=sum('Non-Current Assets'),totalAssets=round2(currentAssets+nonCurrentAssets);
  const currentLiabilities=round2(sum('Trade & Other Payables')+sum('Other Current Liabilities'));
  const nonCurrentLiabilities=sum('Non-Current Liabilities'),totalLiabilities=round2(currentLiabilities+nonCurrentLiabilities),totalEquity=sum('Equity'),liabilitiesEquity=round2(totalLiabilities+totalEquity);
  return {meta:await meta('Statement of Financial Position / Balance Sheet',null,to),asOf:to,groups,totals:{currentAssets,nonCurrentAssets,totalAssets,currentLiabilities,nonCurrentLiabilities,totalLiabilities,totalEquity,liabilitiesEquity,difference:round2(totalAssets-liabilitiesEquity)}};
}
async function cashFlowData(from,to){
  const lines=await linesFor(from,to);const byJournal=new Map();
  for(const l of lines){if(!byJournal.has(l.journalEntryId))byJournal.set(l.journalEntryId,[]);byJournal.get(l.journalEntryId).push(l)}
  const groups={OPERATING:[],INVESTING:[],FINANCING:[]};
  for(const ls of byJournal.values()){
    const cash=ls.filter(l=>l.account.systemCode==='BANK'||(l.account.type==='ASSET'&&/cash|bank/.test(String(l.account.name).toLowerCase())));
    const cashFlow=round2(cash.reduce((s,l)=>s+n(l.debit)-n(l.credit),0));if(!cashFlow)continue;
    const other=ls.filter(l=>!cash.includes(l));let group='OPERATING',best=0;
    for(const l of other){const w=Math.abs(n(l.debit)-n(l.credit));if(w>best){best=w;group=['INVESTING','FINANCING'].includes(l.account.cashFlowGroup)?l.account.cashFlowGroup:'OPERATING'}}
    const j=ls[0].journalEntry;groups[group].push({date:j.journalDate,journalNo:j.journalNo,reference:j.referenceNo||'',description:j.description,amount:cashFlow});
  }
  const operating=round2(groups.OPERATING.reduce((s,x)=>s+x.amount,0)),investing=round2(groups.INVESTING.reduce((s,x)=>s+x.amount,0)),financing=round2(groups.FINANCING.reduce((s,x)=>s+x.amount,0)),netChange=round2(operating+investing+financing);
  const openingLines=from?await linesFor(null,ymd(new Date(d0(from).getTime()-1))):[];const opening=round2(openingLines.filter(l=>l.account.systemCode==='BANK'||(l.account.type==='ASSET'&&/cash|bank/.test(String(l.account.name).toLowerCase()))).reduce((s,l)=>s+n(l.debit)-n(l.credit),0));
  return {meta:await meta('Cash Flow Statement',from,to),method:'Cash movements classified by operating, investing and financing activity',groups,totals:{operating,investing,financing,netChange,openingCash:opening,closingCash:round2(opening+netChange)}};
}
async function generalLedgerData(accountId,from,to){
  const account=await prisma.chartAccount.findUnique({where:{id:accountId}});if(!account){const e=new Error('Account not found.');e.status=404;throw e;}
  const openingLines=from?await prisma.journalLine.findMany({where:{accountId,journalEntry:{status:'POSTED',journalDate:{lt:d0(from)}}}}):[];
  let balance=round2(openingLines.reduce((s,l)=>s+n(l.debit)-n(l.credit),0));const openingBalance=balance;
  const rows=(await prisma.journalLine.findMany({where:{accountId,journalEntry:{status:'POSTED',...journalDateWhere(from,to)}},include:{journalEntry:true},orderBy:[{journalEntry:{journalDate:'asc'}},{journalEntry:{journalNo:'asc'}},{lineNo:'asc'}]})).map(l=>{balance=round2(balance+n(l.debit)-n(l.credit));return {date:l.journalEntry.journalDate,journalNo:l.journalEntry.journalNo,reference:l.journalEntry.referenceNo||'',source:l.journalEntry.referenceType||'',description:l.narration||l.journalEntry.description,debit:n(l.debit),credit:n(l.credit),balance};});
  return {meta:await meta(`General Ledger — ${account.accountCode} ${account.name}`,from,to),account,openingBalance,rows,closingBalance:balance,totalDebit:round2(rows.reduce((s,x)=>s+x.debit,0)),totalCredit:round2(rows.reduce((s,x)=>s+x.credit,0))};
}
async function transactionsData(q){
  const where={journalEntry:{status:'POSTED',...journalDateWhere(q.from,q.to)}};if(q.accountId)where.accountId=q.accountId;
  let rows=await prisma.journalLine.findMany({where,include:{account:true,journalEntry:true},orderBy:[{journalEntry:{journalDate:'desc'}},{journalEntry:{journalNo:'desc'}},{lineNo:'asc'}],take:5000});
  if(q.q){const z=String(q.q).toLowerCase();rows=rows.filter(l=>[l.narration,l.journalEntry.description,l.journalEntry.referenceNo,l.journalEntry.journalNo,l.account.accountCode,l.account.name].some(v=>String(v||'').toLowerCase().includes(z)));}
  return {meta:await meta('GL Transaction Extraction',q.from,q.to),rows:rows.map(l=>({date:l.journalEntry.journalDate,journalNo:l.journalEntry.journalNo,reference:l.journalEntry.referenceNo||'',source:l.journalEntry.referenceType||'',code:l.account.accountCode,account:l.account.name,description:l.narration||l.journalEntry.description,debit:n(l.debit),credit:n(l.credit)}))};
}

function flatten(type,d){
  if(type==='trial-balance')return d.rows.map(x=>({Code:x.code,Account:x.account,Type:x.type,Opening:x.opening,Debit:x.debit,Credit:x.credit,Closing:x.closing}));
  if(type==='profit-loss'){const out=[];for(const [g,arr] of Object.entries(d.groups))for(const x of arr)out.push({Section:g,Code:x.code,Account:x.account,Amount:x.amount});return out;}
  if(type==='balance-sheet'){const out=[];for(const [g,arr] of Object.entries(d.groups))for(const x of arr)out.push({Section:g,Code:x.code,Account:x.account,Amount:x.amount});return out;}
  if(type==='cash-flow'){const out=[];for(const [g,arr] of Object.entries(d.groups))for(const x of arr)out.push({Activity:g,Date:x.date,Journal:x.journalNo,Reference:x.reference,Description:x.description,Amount:x.amount});return out;}
  if(type==='general-ledger')return d.rows.map(x=>({Date:x.date,Journal:x.journalNo,Reference:x.reference,Source:x.source,Description:x.description,Debit:x.debit,Credit:x.credit,Balance:x.balance}));
  if(type==='transactions')return d.rows.map(x=>({Date:x.date,Journal:x.journalNo,Reference:x.reference,Source:x.source,Code:x.code,Account:x.account,Description:x.description,Debit:x.debit,Credit:x.credit}));
  return [];
}
async function toExcel(res,type,d){
  const wb=new ExcelJS.Workbook();wb.creator='DARILTWEENS NIGERIA LIMITED';const ws=wb.addWorksheet('Report');const rows=flatten(type,d);const keys=rows.length?Object.keys(rows[0]):['Message'];const title=d.meta.title;
  ws.mergeCells(1,1,1,Math.max(keys.length,4));ws.getCell(1,1).value=d.meta.company;ws.getCell(1,1).font={bold:true,size:16};
  ws.mergeCells(2,1,2,Math.max(keys.length,4));ws.getCell(2,1).value=title;ws.getCell(2,1).font={bold:true,size:13};
  ws.mergeCells(3,1,3,Math.max(keys.length,4));ws.getCell(3,1).value=`Reporting period: ${d.meta.period}`;
  ws.mergeCells(4,1,4,Math.max(keys.length,4));ws.getCell(4,1).value=`Generated: ${d.meta.generatedAt.toLocaleString('en-NG')}`;
  ws.addRow([]);const hr=ws.addRow(keys);hr.font={bold:true};
  for(const row of rows){const vals=keys.map(k=>row[k]);const rr=ws.addRow(vals);rr.eachCell(c=>{if(c.value instanceof Date)c.numFmt='dd-mmm-yyyy';if(typeof c.value==='number')c.numFmt='#,##0.00;[Red](#,##0.00)'})}
  ws.views=[{state:'frozen',ySplit:6}];keys.forEach((k,i)=>ws.getColumn(i+1).width=Math.max(14,Math.min(42,Math.max(k.length+2,...rows.slice(0,100).map(r=>String(r[k]??'').length+2)))));
  ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="DNL_${type}_${Date.now()}.xlsx"`);await wb.xlsx.write(res);res.end();
}
async function toPdf(res,type,d){
  const rows=flatten(type,d);const doc=new PDFDocument({size:'A4',layout:rows.length&&Object.keys(rows[0]).length>5?'landscape':'portrait',margin:36});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="DNL_${type}_${Date.now()}.pdf"`);doc.pipe(res);
  doc.fontSize(15).text(d.meta.company,{align:'center'});doc.fontSize(12).text(d.meta.title,{align:'center'});doc.fontSize(8).text(`Period: ${d.meta.period}   |   Generated: ${d.meta.generatedAt.toLocaleString('en-NG')}`,{align:'center'});doc.moveDown();
  if(!rows.length){doc.fontSize(10).text('No records for the selected period.');doc.end();return;}
  const keys=Object.keys(rows[0]),w=(doc.page.width-72)/keys.length;doc.fontSize(7).font('Helvetica-Bold');keys.forEach((k,i)=>doc.text(k,36+i*w,doc.y,{width:w-3}));doc.moveDown(1.4).font('Helvetica');
  for(const row of rows){if(doc.y>doc.page.height-55)doc.addPage();const y=doc.y;keys.forEach((k,i)=>{let v=row[k];if(v instanceof Date)v=ymd(v);if(typeof v==='number')v=v.toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});doc.text(String(v??''),36+i*w,y,{width:w-3,height:24,ellipsis:true})});doc.y=y+26;}
  doc.end();
}
async function getData(type,q){
  if(type==='trial-balance')return trialBalanceData(q.from,q.to);
  if(type==='profit-loss')return profitLossData(q.from,q.to);
  if(type==='balance-sheet')return balanceSheetData(q.asOf||q.to);
  if(type==='cash-flow')return cashFlowData(q.from,q.to);
  if(type==='transactions')return transactionsData(q);
  throw new Error('Unknown accounting report.');
}

r.get('/catalog',(req,res)=>res.json([
  {code:'trial-balance',name:'Trial Balance'},{code:'profit-loss',name:'Profit & Loss Statement'},{code:'balance-sheet',name:'Statement of Financial Position'},{code:'cash-flow',name:'Cash Flow Statement'},{code:'general-ledger',name:'General Ledger'},{code:'transactions',name:'GL Transaction Extraction'}
]));
for(const type of ['trial-balance','profit-loss','balance-sheet','cash-flow','transactions']){
  r.get(`/${type}`,async(req,res,next)=>{try{res.json(await getData(type,req.query))}catch(e){next(e)}});
  r.get(`/${type}.xlsx`,async(req,res,next)=>{try{await toExcel(res,type,await getData(type,req.query))}catch(e){next(e)}});
  r.get(`/${type}.pdf`,async(req,res,next)=>{try{await toPdf(res,type,await getData(type,req.query))}catch(e){next(e)}});
}
r.get('/general-ledger/:accountId.xlsx',async(req,res,next)=>{try{await toExcel(res,'general-ledger',await generalLedgerData(req.params.accountId,req.query.from,req.query.to))}catch(e){next(e)}});
r.get('/general-ledger/:accountId.pdf',async(req,res,next)=>{try{await toPdf(res,'general-ledger',await generalLedgerData(req.params.accountId,req.query.from,req.query.to))}catch(e){next(e)}});
r.get('/general-ledger/:accountId',async(req,res,next)=>{try{res.json(await generalLedgerData(req.params.accountId,req.query.from,req.query.to))}catch(e){next(e)}});

export default r;
