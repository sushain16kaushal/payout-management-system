import { runAdvancePayoutJob } from '../src/services/advancePayout.service.js';
import prisma from '../src/config/db.js';
import {
  cleanDatabase,
  createTestUser,
  createTestBrand,
  createTestSale,
  disconnectDb,
} from './helpers/testSetup.js';

describe('Advance Payout Engine', () => {
  let user;
  let brand;

  beforeEach(async () => {
    await cleanDatabase();
    user = await createTestUser();
    brand = await createTestBrand();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDb();
  });

  test('calculates 10% advance correctly for a pending sale', async () => {
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

    const result = await runAdvancePayoutJob(user.id);

    expect(result.totalProcessed).toBe(1);
    expect(result.totalAdvancePaid).toBe(4); // 10% of ₹40

    const updatedSale = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(updatedSale.advancePaid).toBe(true);
    expect(Number(updatedSale.advanceAmount)).toBe(4);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(4);
  });

  test('matches the exact PDF example: 3 sales of ₹40 → ₹12 total advance', async () => {
    await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });
    await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });
    await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

    const result = await runAdvancePayoutJob(user.id);

    expect(result.totalProcessed).toBe(3);
    expect(result.totalAdvancePaid).toBe(12); // 10% of ₹120 total

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(12);
  });

 test('is idempotent — running the job twice does not double-pay', async () => {
  await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

  const firstRun = await runAdvancePayoutJob(user.id);
  expect(firstRun.totalProcessed).toBe(1);
  expect(firstRun.totalAdvancePaid).toBe(4);

  const secondRun = await runAdvancePayoutJob(user.id);
  // The already-paid sale is filtered out at the query level itself
  // (WHERE advancePaid = false), so it never even reaches the
  // "skipped" branch — it simply isn't fetched as eligible at all.
  expect(secondRun.totalSalesChecked).toBe(0);
  expect(secondRun.totalProcessed).toBe(0);
  expect(secondRun.totalSkipped).toBe(0);
  expect(secondRun.totalAdvancePaid).toBe(0);

  // Wallet should still only reflect ONE advance payment, not two
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  expect(Number(updatedUser.walletBalance)).toBe(4);
});

  test('is idempotent under concurrent execution (race condition safety)', async () => {
    await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

    // Fire the SAME advance payout job twice, simultaneously — this is
    // the exact scenario the row-locking logic exists to protect against.
    const [resultA, resultB] = await Promise.all([
      runAdvancePayoutJob(user.id),
      runAdvancePayoutJob(user.id),
    ]);

    const totalProcessed = resultA.totalProcessed + resultB.totalProcessed;
    const totalAdvancePaid = resultA.totalAdvancePaid + resultB.totalAdvancePaid;

    // Exactly ONE of the two concurrent runs should have processed the
    // sale; the other should have found it already locked/paid.
    expect(totalProcessed).toBe(1);
    expect(totalAdvancePaid).toBe(4);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(4);
  });

  test('skips sales that are not PENDING', async () => {
    await createTestSale({
      userId: user.id,
      brandId: brand.id,
      earning: 40,
      status: 'APPROVED',
    });

    const result = await runAdvancePayoutJob(user.id);

    expect(result.totalSalesChecked).toBe(0); // filtered out at the query level
    expect(result.totalProcessed).toBe(0);
  });

  test('handles decimal earnings without floating point drift', async () => {
    await createTestSale({ userId: user.id, brandId: brand.id, earning: 25 });

    const result = await runAdvancePayoutJob(user.id);

    expect(result.totalAdvancePaid).toBe(2.5); // 10% of ₹25
  });
});