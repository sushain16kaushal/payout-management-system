import { initiateWithdrawal } from '../src/services/withdrawal.service.js';
import { updatePayoutStatus } from '../src/services/payoutRecovery.service.js';
import prisma from '../src/config/db.js';
import { cleanDatabase, createTestUser, disconnectDb } from './helpers/testSetup.js';

describe('Withdrawal System', () => {
  let user;

  beforeEach(async () => {
    await cleanDatabase();
    user = await createTestUser({ walletBalance: 100 });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDb();
  });

  test('allows a withdrawal when balance is sufficient and no prior withdrawal exists', async () => {
    const transaction = await initiateWithdrawal(user.id, 50);

    expect(transaction.status).toBe('INITIATED');
    expect(Number(transaction.amount)).toBe(50);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(50); // 100 - 50
    expect(updatedUser.lastWithdrawalAt).not.toBeNull();
  });

  test('rejects withdrawal amount greater than wallet balance', async () => {
    await expect(initiateWithdrawal(user.id, 999)).rejects.toThrow(/Insufficient balance/);

    // Balance must remain untouched
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(100);
  });

  test('rejects a second withdrawal within 24 hours', async () => {
    await initiateWithdrawal(user.id, 20);

    await expect(initiateWithdrawal(user.id, 20)).rejects.toThrow(/Withdrawal not allowed yet/);

    // Only the first withdrawal should have been deducted
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(80); // 100 - 20, not 100 - 40
  });

  test('allows withdrawal after 24 hours have passed', async () => {
    await initiateWithdrawal(user.id, 20);

    // Simulate the 24hr cooldown having already elapsed by manually
    // backdating lastWithdrawalAt beyond the cooldown window.
    await prisma.user.update({
      where: { id: user.id },
      data: { lastWithdrawalAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const transaction = await initiateWithdrawal(user.id, 10);
    expect(transaction.status).toBe('INITIATED');

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(70); // 100 - 20 - 10
  });

  test('is idempotent under concurrent withdrawal attempts (race condition safety)', async () => {
    // Two simultaneous withdrawal attempts — only one should succeed,
    // since the second must observe the freshly-set lastWithdrawalAt
    // once the row lock releases.
    const results = await Promise.allSettled([
      initiateWithdrawal(user.id, 30),
      initiateWithdrawal(user.id, 30),
    ]);

    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(70); // only ONE ₹30 deducted
  });
});

describe('Failed Payout Recovery', () => {
  let user;
  let withdrawalTx;

  beforeEach(async () => {
    await cleanDatabase();
    user = await createTestUser({ walletBalance: 100 });
    withdrawalTx = await initiateWithdrawal(user.id, 40);
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDb();
  });

  test('recredits wallet when a withdrawal fails', async () => {
    const result = await updatePayoutStatus(withdrawalTx.id, 'FAILED');

    expect(result.amountRecredited).toBe(40);

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(100); // fully restored
  });

  test('resets lastWithdrawalAt so the user can withdraw again immediately', async () => {
    await updatePayoutStatus(withdrawalTx.id, 'CANCELLED');

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser.lastWithdrawalAt).toBeNull();

    // Should now be able to withdraw again without hitting the 24hr block
    const newTransaction = await initiateWithdrawal(user.id, 25);
    expect(newTransaction.status).toBe('INITIATED');
  });

  test('does NOT recredit wallet when payout is marked SUCCESS', async () => {
    await updatePayoutStatus(withdrawalTx.id, 'SUCCESS');

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(60); // still 100 - 40, unchanged
  });

  test('is idempotent — a terminal-state transaction cannot be updated again', async () => {
    await updatePayoutStatus(withdrawalTx.id, 'FAILED');
    const secondAttempt = await updatePayoutStatus(withdrawalTx.id, 'FAILED');

    expect(secondAttempt.skipped).toBe(true);

    // Wallet must reflect only ONE recredit, not two
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(Number(updatedUser.walletBalance)).toBe(100);
  });

  test('rejects updating a non-WITHDRAWAL transaction type', async () => {
    const fakeAdvanceTx = await prisma.payoutTransaction.create({
      data: { userId: user.id, type: 'ADVANCE', amount: 5, status: 'INITIATED' },
    });

    await expect(updatePayoutStatus(fakeAdvanceTx.id, 'FAILED')).rejects.toThrow(
      /Only withdrawal transactions/
    );
  });
});