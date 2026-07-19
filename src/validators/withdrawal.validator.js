import { z } from 'zod';

export const createWithdrawalSchema = z.object({
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
  amount: z.number().positive({ message: 'amount must be a positive number' }),
});