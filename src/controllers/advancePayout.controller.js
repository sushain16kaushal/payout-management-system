import * as advancePayoutService from '../services/advancePayout.service.js';

export async function runAdvancePayout(req, res, next) {
  try {
    const { userId } = req.body; // optional — if omitted, runs for all users
    const result = await advancePayoutService.runAdvancePayoutJob(userId || null);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}