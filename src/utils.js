import { prisma } from './prisma.js';

export async function audit(userId,action,entity,entityId=null,details=null,ipHint=null){
  await prisma.auditLog.create({data:{userId:userId||null,action,entity,entityId,details,ipHint}});
}
export async function setting(key,fallback=''){
  return (await prisma.setting.findUnique({where:{key}}))?.value ?? fallback;
}
export async function nextPvNo(){
  return prisma.$transaction(async tx=>{
    const currentYear=new Date().getFullYear();
    let seq=await tx.sequence.findUnique({where:{code:'PV'}});
    if(!seq) seq=await tx.sequence.create({data:{code:'PV',prefix:'PV',lastNo:0,year:currentYear,padLength:6}});
    let lastNo=seq.lastNo, year=seq.year;
    if(year!==currentYear){year=currentYear;lastNo=0;}
    lastNo+=1;
    seq=await tx.sequence.update({where:{code:'PV'},data:{lastNo,year}});
    return `${seq.prefix}/${year}/${String(lastNo).padStart(seq.padLength,'0')}`;
  });
}

export async function nextSequenceNo(code, prefix=code, padLength=6){
  return prisma.$transaction(async tx=>{
    const currentYear=new Date().getFullYear();
    let seq=await tx.sequence.findUnique({where:{code}});
    if(!seq) seq=await tx.sequence.create({data:{code,prefix,lastNo:0,year:currentYear,padLength}});
    let lastNo=seq.lastNo, year=seq.year;
    if(year!==currentYear){year=currentYear;lastNo=0;}
    lastNo+=1;
    seq=await tx.sequence.update({where:{code},data:{lastNo,year,prefix,padLength}});
    return `${seq.prefix}/${year}/${String(lastNo).padStart(seq.padLength,'0')}`;
  });
}
