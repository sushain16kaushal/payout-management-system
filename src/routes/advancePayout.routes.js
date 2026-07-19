import express from 'express';
import * as advancePayoutController from '../controllers/advancePayout.controller.js';

const router = express.Router();

router.post('/run', advancePayoutController.runAdvancePayout);

export default router;