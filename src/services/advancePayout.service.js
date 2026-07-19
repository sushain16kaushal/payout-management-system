import prisma from '../config/db.js';
import { ADVANCE_PAYOUT_PERCENTAGE } from '../config/constants.js';

/**
 * Processes advance payout for a single sale, with row-level locking
 * to guarantee idempotency even under concurrent execution.
 */
async function processSingleSaleAdvance(saleId) {
  return prisma.$transaction(async (tx) => {
    // Lock the row — any other concurrent transaction trying to touch
    // this same sale will block here until we commit/rollback.
   const [sale] = await tx.$queryRaw`
  SELECT * FROM "Sale" WHERE id = ${saleId} FOR UPDATE
`;

    if (!sale) {
      return { saleId, skipped: true, reason: 'Sale not found' };
    }

    // Re-check eligibility AFTER acquiring the lock — this is the
    // critical idempotency check. Even if this sale was already
    // processed by a concurrent transaction moments ago, we see the
    // fresh, locked state here.
    if (sale.status !== 'PENDING' || sale.advancePaid === true) {
      return { saleId, skipped: true, reason: 'Not eligible (already paid or not pending)' };
    }

    const earning = Number(sale.earning);
    const advanceAmount = Math.round(earning * ADVANCE_PAYOUT_PERCENTAGE * 100) / 100;

    // Mark sale as advance-paid
    await tx.sale.update({
      where: { id: saleId },
      data: { advancePaid: true, advanceAmount },
    });

    // Record the transaction (audit trail)
    await tx.payoutTransaction.create({
      data: {
        userId: sale.userId,
        saleId: sale.id,
        type: 'ADVANCE',
        amount: advanceAmount,
        status: 'SUCCESS',
      },
    });

    // Credit user's wallet
    await tx.user.update({
      where: { id: sale.userId },
      data: { walletBalance: { increment: advanceAmount } },
    });

    return { saleId, skipped: false, advanceAmount };
  });
}

/**
 * Runs the advance payout job. If userId is provided, scoped to that
 * user only; otherwise runs for all eligible sales system-wide.
 */
export async function runAdvancePayoutJob(userId = null) {
  const where = {
    status: 'PENDING',
    advancePaid: false,
    ...(userId ? { userId } : {}),
  };

  // Just fetch IDs here — the actual eligibility re-check happens
  // inside each locked transaction above, so this list can be stale.
  const eligibleSales = await prisma.sale.findMany({
    where,
    select: { id: true },
  });

  const results = [];
  for (const { id } of eligibleSales) {
    const result = await processSingleSaleAdvance(id);
    results.push(result);
  }

  const processed = results.filter((r) => !r.skipped);
  const totalAdvancePaid = processed.reduce((sum, r) => sum + r.advanceAmount, 0);

  return {
    totalSalesChecked: eligibleSales.length,
    totalProcessed: processed.length,
    totalSkipped: results.length - processed.length,
    totalAdvancePaid,
    details: results,
  };
}