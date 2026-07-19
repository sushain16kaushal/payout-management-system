import express from 'express';
import * as reconciliationController from '../controllers/reconciliation.controller.js';

const router = express.Router();

router.post('/', reconciliationController.reconcileSales);

export default router;