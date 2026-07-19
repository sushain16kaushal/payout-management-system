import prisma from '../config/db.js';

/**
 * Reconciles a single sale with row-level locking for idempotency —
 * same pattern as the advance payout engine.
 */
async function reconcileSingleSale(saleId, newStatus) {
  return prisma.$transaction(async (tx) => {
    const [sale] = await tx.$queryRaw`
      SELECT * FROM "Sale" WHERE id = ${saleId} FOR UPDATE
    `;

    if (!sale) {
      return { saleId, skipped: true, reason: 'Sale not found' };
    }

    // Idempotency: only PENDING sales can be reconciled. If this sale
    // was already reconciled (by a prior call or a concurrent one),
    // we skip it rather than reprocessing.
    if (sale.status !== 'PENDING') {
      return { saleId, skipped: true, reason: `Already reconciled as ${sale.status}` };
    }

    const earning = Number(sale.earning);
    const advancePaid = sale.advancePaid ? Number(sale.advanceAmount) : 0;

    let finalAmount;
    if (newStatus === 'APPROVED') {
      // Full earning minus whatever advance was already transferred
      finalAmount = earning - advancePaid;
    } else {
      // REJECTED: claw back any advance already paid; if no advance
      // was paid, there is nothing to adjust.
      finalAmount = advancePaid > 0 ? -advancePaid : 0;
    }

    finalAmount = Math.round(finalAmount * 100) / 100;

    await tx.sale.update({
      where: { id: saleId },
      data: { status: newStatus, reconciledAt: new Date() },
    });

    await tx.payoutTransaction.create({
      data: {
        userId: sale.userId,
        saleId: sale.id,
        type: 'FINAL_ADJUSTMENT',
        amount: finalAmount,
        status: 'SUCCESS',
      },
    });

    // finalAmount can be negative (rejected sale clawback) — Prisma's
    // `increment` handles negative values correctly, effectively
    // decrementing the wallet.
    await tx.user.update({
      where: { id: sale.userId },
      data: { walletBalance: { increment: finalAmount } },
    });

    return { saleId, skipped: false, status: newStatus, finalAmount };
  });
}

export async function bulkReconcile(reconciliations) {
  const results = [];

  for (const { saleId, status } of reconciliations) {
    const result = await reconcileSingleSale(saleId, status);
    results.push(result);
  }

  const processed = results.filter((r) => !r.skipped);
  const totalFinalPayout = processed.reduce((sum, r) => sum + r.finalAmount, 0);

  return {
    totalRequested: reconciliations.length,
    totalProcessed: processed.length,
    totalSkipped: results.length - processed.length,
    totalFinalPayout,
    details: results,
  };
}