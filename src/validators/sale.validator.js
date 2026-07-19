import z from 'zod';

export const createSaleSchema = z.object({
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
  brandId: z.string().uuid({ message: 'brandId must be a valid UUID' }),
  earning: z.number().positive({ message: 'earning must be a positive number' }),
});

export const listSalesQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

