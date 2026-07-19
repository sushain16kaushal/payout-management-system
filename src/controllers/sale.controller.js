import * as saleService from '../services/sale.service.js';
import { createSaleSchema, listSalesQuerySchema } from '../validators/sale.validator.js';

export async function createSale(req, res, next) {
  try {
    const parsed = createSaleSchema.parse(req.body);
    const sale = await saleService.createSale(parsed);
    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}

export async function listSales(req, res, next) {
  try {
    const parsed = listSalesQuerySchema.parse(req.query);
    const sales = await saleService.listSales(parsed);
    res.status(200).json({ success: true, count: sales.length, data: sales });
  } catch (err) {
    next(err);
  }
}

export async function getSale(req, res, next) {
  try {
    const sale = await saleService.getSaleById(req.params.id);
    res.status(200).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}

