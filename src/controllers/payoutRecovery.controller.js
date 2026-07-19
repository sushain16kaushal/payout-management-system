import * as payoutRecoveryService from '../services/payoutRecovery.service.js';
import { updatePayoutStatusSchema } from '../validators/payoutRecovery.validator.js';

export async function updateStatus(req, res, next) {
  try {
    const { status } = updatePayoutStatusSchema.parse(req.body);
    const result = await payoutRecoveryService.updatePayoutStatus(req.params.id, status);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}