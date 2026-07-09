import { Router } from 'express';
import { body } from 'express-validator';
import { login } from '../services/authService.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../utils/validation.js';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  validate,
  asyncHandler(async (req, res) => {
    const session = await login(req.body.email, req.body.password);
    if (!session) return res.status(401).json({ message: 'Invalid credentials' });
    return res.json(session);
  })
);

authRoutes.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});
