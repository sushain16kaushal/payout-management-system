import prisma from '../config/db.js';

export async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      sales: true,
      transactions: { orderBy: { createdAt: 'desc' } },
    },
  });

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  return user;
}