import express from 'express';
import * as payoutRecoveryController from '../controllers/payoutRecovery.controller.js';

const router = express.Router();

router.patch('/:id/status', payoutRecoveryController.updateStatus);

export default router;