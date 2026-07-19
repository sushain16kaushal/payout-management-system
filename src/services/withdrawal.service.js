import prisma from '../config/db.js';

const WITHDRAWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function initiateWithdrawal(userId, amount) {
  return prisma.$transaction(async (tx) => {
    // Lock the user row so concurrent withdrawal requests queue up
    // instead of racing each other on the 24hr check.
    const [user] = await tx.$queryRaw`
      SELECT * FROM "User" WHERE id = ${userId} FOR UPDATE
    `;

    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const walletBalance = Number(user.walletBalance);

    if (amount > walletBalance) {
      const err = new Error(
        `Insufficient balance. Available: ${walletBalance}, Requested: ${amount}`
      );
      err.statusCode = 400;
      throw err;
    }

    if (user.lastWithdrawalAt) {
      const elapsed = Date.now() - new Date(user.lastWithdrawalAt).getTime();
      if (elapsed < WITHDRAWAL_COOLDOWN_MS) {
        const remainingMs = WITHDRAWAL_COOLDOWN_MS - elapsed;
        const remainingHours = (remainingMs / (60 * 60 * 1000)).toFixed(1);
        const err = new Error(
          `Withdrawal not allowed yet. Try again in ${remainingHours} hour(s).`
        );
        err.statusCode = 429; // Too Many Requests — semantically fits a rate-limit-style rule
        throw err;
      }
    }

    // Deduct from wallet immediately (funds are "locked" the moment
    // withdrawal is initiated, not when it settles) and stamp the
    // withdrawal timestamp.
    await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { decrement: amount },
        lastWithdrawalAt: new Date(),
      },
    });

    const transaction = await tx.payoutTransaction.create({
      data: {
        userId,
        type: 'WITHDRAWAL',
        amount,
        status: 'INITIATED',
      },
    });

    return transaction;
  });
}