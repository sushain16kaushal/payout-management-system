import express from 'express';
import * as withdrawalController from '../controllers/withdrawal.controller.js';

const router = express.Router();

router.post('/', withdrawalController.createWithdrawal);

export default router;