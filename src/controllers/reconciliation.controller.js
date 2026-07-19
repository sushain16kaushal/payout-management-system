import * as reconciliationService from '../services/reconciliation.service.js';
import { bulkReconcileSchema } from '../validators/reconciliation.validator.js';

export async function reconcileSales(req, res, next) {
  try {
    const { reconciliations } = bulkReconcileSchema.parse(req.body);
    const result = await reconciliationService.bulkReconcile(reconciliations);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}