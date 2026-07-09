import { validationResult } from 'express-validator';

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(422).json({ message: 'Validation failed', errors: errors.array() });
}

export function toNull(value) {
  return value === undefined || value === '' ? null : value;
}
