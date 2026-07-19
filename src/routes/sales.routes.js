import express from 'express';
const router = express.Router();
import {createSale,listSales,getSale} from '../controllers/sale.controller.js';

router.post('/', createSale);
router.get('/', listSales);
router.get('/:id', getSale);

export default router;