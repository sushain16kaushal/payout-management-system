import express from 'express';
import saleRoutes from './sales.routes.js';
import advancePayoutRoutes from './advancePayout.routes.js';
import reconciliationRoutes from './reconciliation.routes.js';
import withdrawalRoutes from './withdrawal.routes.js';
import payoutRecoveryRoutes from './payoutRecovery.routes.js';
import userRoutes from './user.routes.js';
const router = express.Router();
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

router.use('/sales', saleRoutes);
router.use('/payouts/advance', advancePayoutRoutes);
router.use('/reconciliations', reconciliationRoutes);
router.use('/withdrawals', withdrawalRoutes);
router.use('/payouts', payoutRecoveryRoutes);
router.use('/users', userRoutes);
export default router;
