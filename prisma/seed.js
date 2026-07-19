import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data (safe for dev/testing only — never in production!)
  await prisma.payoutTransaction.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.user.deleteMany();

  // Create Users
  const johnDoe = await prisma.user.create({
    data: {
      name: 'John Doe',
      email: 'john_doe@example.com',
      walletBalance: 0,
    },
  });

  const janeSmith = await prisma.user.create({
    data: {
      name: 'Jane Smith',
      email: 'jane_smith@example.com',
      walletBalance: 0,
    },
  });

  // Create Brands
  const brand1 = await prisma.brand.create({ data: { name: 'brand_1' } });
  const brand2 = await prisma.brand.create({ data: { name: 'brand_2' } });
  const brand3 = await prisma.brand.create({ data: { name: 'brand_3' } });

  // Create Sales — matches the assignment PDF example
  // (3 pending sales of ₹40 each for john_doe, brand_1)
  await prisma.sale.createMany({
    data: [
      { userId: johnDoe.id, brandId: brand1.id, earning: 40, status: 'PENDING' },
      { userId: johnDoe.id, brandId: brand1.id, earning: 40, status: 'PENDING' },
      { userId: johnDoe.id, brandId: brand1.id, earning: 40, status: 'PENDING' },
    ],
  });

  // A couple of extra sales for jane_smith, spread across brands
  await prisma.sale.createMany({
    data: [
      { userId: janeSmith.id, brandId: brand2.id, earning: 100, status: 'PENDING' },
      { userId: janeSmith.id, brandId: brand3.id, earning: 25, status: 'PENDING' },
    ],
  });

  console.log('Seeding complete.');
  console.log({ johnDoe, janeSmith, brand1, brand2, brand3 });
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });