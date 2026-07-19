import prisma from '../config/db.js';

const FAILURE_STATUSES = ['FAILED', 'CANCELLED', 'REJECTED'];

export async function updatePayoutStatus(transactionId, newStatus) {
  return prisma.$transaction(async (tx) => {
    const [transaction] = await tx.$queryRaw`
      SELECT * FROM "PayoutTransaction" WHERE id = ${transactionId} FOR UPDATE
    `;

    if (!transaction) {
      const err = new Error('Transaction not found');
      err.statusCode = 404;
      throw err;
    }

    if (transaction.type !== 'WITHDRAWAL') {
      const err = new Error('Only withdrawal transactions can be updated this way');
      err.statusCode = 400;
      throw err;
    }

    // Idempotency: a transaction already in a terminal state
    // (SUCCESS or any failure state) should not be reprocessed.
    const terminalStates = ['SUCCESS', ...FAILURE_STATUSES];
    if (terminalStates.includes(transaction.status)) {
      return {
        transactionId,
        skipped: true,
        reason: `Transaction already in terminal state: ${transaction.status}`,
      };
    }

    await tx.payoutTransaction.update({
      where: { id: transactionId },
      data: { status: newStatus },
    });

    // Only credit funds back if this is a failure-type status.
    // On SUCCESS, funds were already deducted at initiation — nothing
    // further happens to the wallet.
    if (FAILURE_STATUSES.includes(newStatus)) {
      const amount = Number(transaction.amount);

      await tx.user.update({
        where: { id: transaction.userId },
        data: {
          walletBalance: { increment: amount },
          // Reset the cooldown so the user isn't penalized for a
          // withdrawal that never actually went through.
          lastWithdrawalAt: null,
        },
      });

      return {
        transactionId,
        skipped: false,
        newStatus,
        amountRecredited: amount,
      };
    }

    return { transactionId, skipped: false, newStatus, amountRecredited: 0 };
  });
}