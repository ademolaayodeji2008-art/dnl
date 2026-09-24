import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const role = await prisma.role.findUnique({
    where: { code: 'SALES_PERSON' }
  });

  if (!role) throw new Error('SALES_PERSON role not found.');

  const wanted = [
    'CHEQUE_VIEW',
    'CHEQUE_CREATE',
    'CHEQUE_PRESENT',
    'CHEQUE_CLEAR',
    'CHEQUE_BOUNCE',
    'CHEQUE_CANCEL',
    'CHEQUE_REPLACE'
  ];

  const permissions = await prisma.permission.findMany({
    where: { code: { in: wanted } }
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id
        }
      },
      update: { allowed: true },
      create: {
        roleId: role.id,
        permissionId: permission.id,
        allowed: true
      }
    });
  }

  console.log('PASS: Sales Officer cheque tracking permissions granted.');
  console.log('Granted:', permissions.map(p => p.code).join(', '));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
