import * as withdrawalService from '../services/withdrawal.service.js';
import { createWithdrawalSchema } from '../validators/withdrawal.validator.js';

export async function createWithdrawal(req, res, next) {
  try {
    const { userId, amount } = createWithdrawalSchema.parse(req.body);
    const transaction = await withdrawalService.initiateWithdrawal(userId, amount);
    res.status(201).json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
}