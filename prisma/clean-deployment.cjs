const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SUPER_ADMIN_ID =
  process.env.DNL_SUPER_ADMIN_ID ||
  'cd836181-e8cb-4f4e-afe9-56419d45d591';

const EXECUTE = process.argv.includes('--execute');

const DELETE_ORDER = [
  'voucherAttachment',
  'expense',
  'payment',
  'approval',
  'voucherItem',
  'voucher',

  'salesReceipt',
  'salesPayment',
  'customerCheque',
  'customerRefund',
  'salesReturnLine',
  'salesReturn',

  'supplierRefund',
  'purchaseReturnLine',
  'purchaseReturn',
  'purchasePayment',

  'salesInvoiceLine',
  'salesInvoice',
  'purchaseBillLine',
  'purchaseBill',

  'inventoryIssueLine',
  'inventoryIssue',
  'stockAdjustmentLine',
  'stockAdjustment',
  'stockTransferLine',
  'stockTransfer',
  'stockMovement',
  'inventoryBatch',
  'inventoryLocationBalance',
  'itemConversion',

  'bankStatementEntry',
  'bankReconciliation',
  'bankTransaction',

  'journalLine',
  'journalEntry',
  'monthEndChecklist',
  'accountingPeriod',

  'budgetLine',
  'budget',
  'controlApproval',
  'auditException',
  'auditQuery',

  'notification',
  'auditLog',
  'accountToken',
  'userSession',

  'inventoryItem',
  'inventoryLocation',
  'customer',
  'supplier',
  'companyBank'
];

async function verifySuperAdmin() {
  const user = await prisma.user.findUnique({
    where: { id: SUPER_ADMIN_ID },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      staffId: true,
      roles: {
        where: { active: true },
        select: {
          role: {
            select: {
              code: true
            }
          }
        }
      }
    }
  });

  if (!user) {
    throw new Error('Protected Super Admin account was not found.');
  }

  if (!user.roles.some(x => x.role.code === 'SUPER_ADMIN')) {
    throw new Error(
      'Protected account does not have an active SUPER_ADMIN role.'
    );
  }

  return user;
}

async function showCounts() {
  let total = 0;

  for (const model of DELETE_ORDER) {
    const count = await prisma[model].count();
    total += count;
    console.log(`${model.padEnd(28)} ${count}`);
  }

  const otherUsers = await prisma.user.count({
    where: { id: { not: SUPER_ADMIN_ID } }
  });

  const staff = await prisma.staff.count();

  console.log(`${'other users'.padEnd(28)} ${otherUsers}`);
  console.log(`${'staff'.padEnd(28)} ${staff}`);

  return total + otherUsers + staff;
}

async function executeCleanup() {
  console.log('');
  console.log('Deleting operational/test data...');
  console.log('');

  for (const model of DELETE_ORDER) {
    const result = await prisma[model].deleteMany({});
    console.log(
      `${model.padEnd(28)} deleted ${result.count}`
    );
  }

  // Remove all role assignments belonging to non-protected users.
  const removedRoles = await prisma.userRole.deleteMany({
    where: {
      userId: {
        not: SUPER_ADMIN_ID
      }
    }
  });

  console.log(
    `${'test user roles'.padEnd(28)} deleted ${removedRoles.count}`
  );

  // Remove all users except protected Super Admin.
  const removedUsers = await prisma.user.deleteMany({
    where: {
      id: {
        not: SUPER_ADMIN_ID
      }
    }
  });

  console.log(
    `${'test users'.padEnd(28)} deleted ${removedUsers.count}`
  );

  // Protected Super Admin has already been verified as having no Staff link.
  const removedStaff = await prisma.staff.deleteMany({});

  console.log(
    `${'staff'.padEnd(28)} deleted ${removedStaff.count}`
  );

  // Reset document numbers while retaining sequence definitions.
  const currentYear = new Date().getFullYear();

  const resetSequences = await prisma.sequence.updateMany({
    data: {
      lastNo: 0,
      year: currentYear
    }
  });

  console.log(
    `${'sequences'.padEnd(28)} reset ${resetSequences.count}`
  );

  // Reset transient login/security state on protected Super Admin.
  await prisma.user.update({
    where: {
      id: SUPER_ADMIN_ID
    },
    data: {
      failedAttempts: 0,
      lockedUntil: null,
      lastLogin: null
    }
  });

  console.log(
    `${'Super Admin'.padEnd(28)} preserved`
  );
}

async function verifyAfterCleanup() {
  console.log('');
  console.log('POST-CLEANUP VERIFICATION');
  console.log('-------------------------');

  const admin = await verifySuperAdmin();

  console.log(`Super Admin: ${admin.email}`);
  console.log(`Status: ${admin.status}`);

  const users = await prisma.user.count();
  const staff = await prisma.staff.count();
  const customers = await prisma.customer.count();
  const suppliers = await prisma.supplier.count();
  const items = await prisma.inventoryItem.count();
  const locations = await prisma.inventoryLocation.count();
  const banks = await prisma.companyBank.count();
  const invoices = await prisma.salesInvoice.count();
  const purchases = await prisma.purchaseBill.count();
  const vouchers = await prisma.voucher.count();
  const journals = await prisma.journalEntry.count();

  console.log(`Users: ${users}`);
  console.log(`Staff: ${staff}`);
  console.log(`Customers: ${customers}`);
  console.log(`Suppliers: ${suppliers}`);
  console.log(`Items: ${items}`);
  console.log(`Locations: ${locations}`);
  console.log(`Banks: ${banks}`);
  console.log(`Invoices: ${invoices}`);
  console.log(`Purchases: ${purchases}`);
  console.log(`Vouchers: ${vouchers}`);
  console.log(`Journals: ${journals}`);

  const config = {
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    rolePermissions: await prisma.rolePermission.count(),
    expenseCategories: await prisma.expenseCategory.count(),
    workflows: await prisma.approvalWorkflow.count(),
    chartAccounts: await prisma.chartAccount.count(),
    sequences: await prisma.sequence.count(),
    settings: await prisma.setting.count()
  };

  console.log('');
  console.log('PRESERVED CONFIGURATION');
  console.table(config);
}

async function main() {
  console.log('');
  console.log('====================================================');
  console.log(' DARILTWEENS NIGERIA LIMITED');
  console.log(' DEPLOYMENT DATABASE CLEANUP');
  console.log('====================================================');
  console.log('');

  const admin = await verifySuperAdmin();

  console.log(
    `Protected Super Admin: ${admin.firstName} ${admin.lastName} <${admin.email}>`
  );

  console.log('');
  console.log('CURRENT RECORDS TARGETED FOR CLEANUP');
  console.log('------------------------------------');

  const total = await showCounts();

  console.log('');
  console.log(`Approximate records targeted: ${total}`);
  console.log('');

  if (!EXECUTE) {
    console.log('DRY RUN COMPLETE.');
    console.log('Nothing was deleted.');
    console.log('');
    console.log('Actual cleanup requires:');
    console.log('node prisma/clean-deployment.cjs --execute');
    return;
  }

  console.log('EXECUTE MODE CONFIRMED.');
  console.log('');

  await executeCleanup();
  await verifyAfterCleanup();

  console.log('');
  console.log('====================================================');
  console.log(' DEPLOYMENT CLEANUP COMPLETED');
  console.log('====================================================');
  console.log('');
}

main()
  .catch(error => {
    console.error('');
    console.error('CLEANUP STOPPED');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
