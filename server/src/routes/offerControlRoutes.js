import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { runOfferControl } from '../services/offerControlService.js';

export const offerControlRoutes = Router();
offerControlRoutes.use(authenticate, requireRole('admin'));

offerControlRoutes.post('/run', asyncHandler(async (_req, res) => {
  const report = await runOfferControl();
  res.status(201).json(report);
}));
