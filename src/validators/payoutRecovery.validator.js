import { z } from 'zod';

export const updatePayoutStatusSchema = z.object({
  status: z.enum(['SUCCESS', 'FAILED', 'CANCELLED', 'REJECTED'], {
    errorMap: () => ({ message: 'status must be one of SUCCESS, FAILED, CANCELLED, REJECTED' }),
  }),
});