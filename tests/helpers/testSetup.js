import prisma from '../../src/config/db.js';

export async function cleanDatabase() {
  // Order matters: delete children before parents (FK constraints)
  await prisma.payoutTransaction.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.user.deleteMany();
}

export async function createTestUser(overrides = {}) {
  return prisma.user.create({
    data: {
      name: 'Test User',
      email: `test-${Date.now()}-${Math.random()}@example.com`,
      walletBalance: 0,
      ...overrides,
    },
  });
}

export async function createTestBrand(overrides = {}) {
  return prisma.brand.create({
    data: {
      name: `test_brand_${Date.now()}_${Math.random()}`,
      ...overrides,
    },
  });
}

export async function createTestSale({ userId, brandId, earning, status = 'PENDING' }) {
  return prisma.sale.create({
    data: { userId, brandId, earning, status },
  });
}

export async function disconnectDb() {
  await prisma.$disconnect();
}