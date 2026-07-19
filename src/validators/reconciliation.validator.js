import { z } from 'zod';

const reconcileItemSchema = z.object({
  saleId: z.string().uuid({ message: 'saleId must be a valid UUID' }),
  status: z.enum(['APPROVED', 'REJECTED'], {
    errorMap: () => ({ message: 'status must be either APPROVED or REJECTED' }),
  }),
});

export const bulkReconcileSchema = z.object({
  reconciliations: z
    .array(reconcileItemSchema)
    .min(1, { message: 'At least one reconciliation entry is required' }),
});