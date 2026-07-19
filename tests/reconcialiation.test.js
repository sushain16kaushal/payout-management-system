import { bulkReconcile } from '../src/services/reconciliation.service.js';
import { runAdvancePayoutJob } from '../src/services/advancePayout.service.js';
import prisma from '../src/config/db.js';
import {
  cleanDatabase,
  createTestUser,
  createTestBrand,
  createTestSale,
  disconnectDb,
} from './helpers/testSetup.js';

describe('Reconciliation Engine', () => {
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

  test('approved sale: final payout = earning - advance already paid', async () => {
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 30 });
    await runAdvancePayoutJob(user.id); // advance = ₹3

    const result = await bulkReconcile([{ saleId: sale.id, status: 'APPROVED' }]);

    expect(result.details[0].finalAmount).toBe(27); // ₹30 - ₹3
    expect(result.totalFinalPayout).toBe(27);
  });

  test('rejected sale: adjustment = -advance already paid', async () => {
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 50 });
    await runAdvancePayoutJob(user.id); // advance = ₹5

    const result = await bulkReconcile([{ saleId: sale.id, status: 'REJECTED' }]);

    expect(result.details[0].finalAmount).toBe(-5);
    expect(result.totalFinalPayout).toBe(-5);
  });

  test('matches the exact PDF example: 1 rejected + 2 approved = ₹68 total', async () => {
    const sales = await Promise.all([
      createTestSale({ userId: user.id, brandId: brand.id, earning: 40 }),
      createTestSale({ userId: user.id, brandId: brand.id, earning: 40 }),
      createTestSale({ userId: user.id, brandId: brand.id, earning: 40 }),
    ]);
    await runAdvancePayoutJob(user.id); // ₹4 advance on each

    const result = await bulkReconcile([
      { saleId: sales[0].id, status: 'REJECTED' },
      { saleId: sales[1].id, status: 'APPROVED' },
      { saleId: sales[2].id, status: 'APPROVED' },
    ]);

    expect(result.totalFinalPayout).toBe(68); // -4 + 36 + 36
  });

  test('approved sale with NO prior advance: final payout = full earning', async () => {
    // Edge case: reconciliation happens before the advance job ever ran
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

    const result = await bulkReconcile([{ saleId: sale.id, status: 'APPROVED' }]);

    expect(result.details[0].finalAmount).toBe(40); // nothing to deduct
  });

  test('rejected sale with NO prior advance: adjustment = 0, not negative', async () => {
    // Edge case: nothing was ever paid out, so nothing should be clawed back
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

    const result = await bulkReconcile([{ saleId: sale.id, status: 'REJECTED' }]);

    expect(result.details[0].finalAmount).toBe(0);
  });

  test('is idempotent — reconciling an already-reconciled sale is skipped', async () => {
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });

    const firstRun = await bulkReconcile([{ saleId: sale.id, status: 'APPROVED' }]);
    expect(firstRun.details[0].skipped).toBe(false);

    const secondRun = await bulkReconcile([{ saleId: sale.id, status: 'REJECTED' }]);
    expect(secondRun.details[0].skipped).toBe(true);
    expect(secondRun.details[0].reason).toContain('Already reconciled');

    // Status should remain APPROVED — the second call must NOT have
    // overwritten it to REJECTED
    const finalSale = await prisma.sale.findUnique({ where: { id: sale.id } });
    expect(finalSale.status).toBe('APPROVED');
  });

  test('handles a mixed batch where one saleId does not exist', async () => {
    const sale = await createTestSale({ userId: user.id, brandId: brand.id, earning: 40 });
    const fakeSaleId = '00000000-0000-0000-0000-000000000000';

    const result = await bulkReconcile([
      { saleId: sale.id, status: 'APPROVED' },
      { saleId: fakeSaleId, status: 'APPROVED' },
    ]);

    expect(result.totalProcessed).toBe(1);
    expect(result.totalSkipped).toBe(1);
    expect(result.details.find((d) => d.saleId === fakeSaleId).reason).toBe('Sale not found');
  });
});