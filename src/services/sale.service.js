import {PrismaClient} from '@prisma/client';

const prisma = new PrismaClient();

export async function createSale({ userId, brandId, earning }) {
  // Ensure user and brand actually exist before creating sale
  const [user, brand] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.brand.findUnique({ where: { id: brandId } }),
  ]);

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (!brand) {
    const err = new Error('Brand not found');
    err.statusCode = 404;
    throw err;
  }

  const sale = await prisma.sale.create({
    data: {
      userId,
      brandId,
      earning,
      status: 'PENDING', // every sale always starts as PENDING
    },
  });

  return sale;
}

export async function listSales({ userId, status }) {
  const where = {};
  if (userId) where.userId = userId;
  if (status) where.status = status;

  return prisma.sale.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { brand: true },
  });
}

export async function getSaleById(id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { brand: true, transactions: true },
  });

  if (!sale) {
    const err = new Error('Sale not found');
    err.statusCode = 404;
    throw err;
  }

  return sale;
}

