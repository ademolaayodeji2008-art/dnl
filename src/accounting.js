import { prisma } from './prisma.js';
import { nextSequenceNo } from './utils.js';

export const num=v=>Number(v||0);
export const round2=v=>Math.round((num(v)+Number.EPSILON)*100)/100;

export async function assertPeriodOpen(date){
  const d=date instanceof Date?date:new Date(date||Date.now());
  if(Number.isNaN(d.getTime()))throw new Error('Invalid transaction date.');
  const p=await prisma.accountingPeriod.findFirst({where:{startDate:{lte:d},endDate:{gte:d},status:'CLOSED'}});
  if(p){const e=new Error(`Accounting period ${p.name} is closed. Reopen the period before posting or changing transactions dated in this period.`);e.status=409;throw e;}
  return true;
}

export async function getSystemAccount(systemCode){
  const a=await prisma.chartAccount.findUnique({where:{systemCode}});
  if(!a)throw new Error(`Accounting system account ${systemCode} is not configured. Run the v6.0 upgrade script.`);
  return a;
}

export async function postJournal({date=new Date(),description,referenceType=null,referenceId=null,referenceNo=null,createdById,lines=[]}){
  await assertPeriodOpen(date);
  if(referenceType&&referenceId){
    const existing=await prisma.journalEntry.findFirst({where:{referenceType,referenceId,status:{in:['POSTED','REVERSED']}},include:{lines:true}});
    if(existing)return existing;
  }
  const prepared=lines.map(x=>({systemCode:x.systemCode,accountId:x.accountId,debit:round2(x.debit),credit:round2(x.credit),narration:x.narration||null})).filter(x=>x.debit||x.credit);
  if(prepared.length<2)throw new Error('A journal entry requires at least two non-zero lines.');
  const debit=round2(prepared.reduce((s,x)=>s+x.debit,0)),credit=round2(prepared.reduce((s,x)=>s+x.credit,0));
  if(Math.abs(debit-credit)>0.01)throw new Error(`Journal is not balanced. Debit ${debit.toFixed(2)} does not equal credit ${credit.toFixed(2)}.`);
  for(const l of prepared)if(!l.accountId){const a=await getSystemAccount(l.systemCode);l.accountId=a.id;}
  const journalNo=await nextSequenceNo('JOURNAL','JRN',7);
  return prisma.journalEntry.create({data:{journalNo,journalDate:new Date(date),description:String(description||'Journal entry'),referenceType,referenceId,referenceNo,status:'POSTED',createdById,postedById:createdById,postedAt:new Date(),lines:{create:prepared.map((l,i)=>({lineNo:i+1,accountId:l.accountId,debit:l.debit,credit:l.credit,narration:l.narration}))}},include:{lines:{include:{account:true}}}});
}

export async function reverseJournal(entryId,userId,reason='Reversal'){
  const original=await prisma.journalEntry.findUnique({where:{id:entryId},include:{lines:true,reversedBy:true}});
  if(!original)throw new Error('Journal entry not found.');
  if(original.status!=='POSTED')throw new Error('Only posted journals can be reversed.');
  if(original.reversedBy)throw new Error('This journal has already been reversed.');
  await assertPeriodOpen(new Date());
  const journalNo=await nextSequenceNo('JOURNAL','JRN',7);
  return prisma.$transaction(async tx=>{
    const reversal=await tx.journalEntry.create({data:{journalNo,journalDate:new Date(),description:`Reversal of ${original.journalNo}: ${reason}`,referenceType:'JOURNAL_REVERSAL',referenceId:original.id,referenceNo:original.journalNo,status:'POSTED',createdById:userId,postedById:userId,postedAt:new Date(),reversalOfId:original.id,lines:{create:original.lines.map((l,i)=>({lineNo:i+1,accountId:l.accountId,debit:l.credit,credit:l.debit,narration:`Reversal: ${l.narration||original.description}`}))}},include:{lines:true}});
    await tx.journalEntry.update({where:{id:original.id},data:{status:'REVERSED'}});
    return reversal;
  });
}

export async function flagException({category,severity='MEDIUM',title,description,entity=null,entityId=null,auditLogId=null}){
  if(entity&&entityId){
    const existing=await prisma.auditException.findFirst({where:{category,entity,entityId,status:{in:['OPEN','ACKNOWLEDGED']}}});
    if(existing)return existing;
  }
  const exceptionNo=await nextSequenceNo('AUDIT_EXCEPTION','EXC',6);
  return prisma.auditException.create({data:{exceptionNo,category,severity,title,description,entity,entityId,auditLogId}});
}

export async function maybeFlagBackdated({entity,entityId,transactionDate,createdAt=new Date(),label='Transaction'}){
  const days=Number((await prisma.setting.findUnique({where:{key:'BACKDATE_EXCEPTION_DAYS'}}))?.value||7);
  const diff=Math.floor((new Date(createdAt)-new Date(transactionDate))/86400000);
  if(diff>days)return flagException({category:'BACKDATED_TRANSACTION',severity:diff>30?'HIGH':'MEDIUM',title:`Backdated ${label}`,description:`${label} was entered ${diff} day(s) after its transaction date.`,entity,entityId});
}
