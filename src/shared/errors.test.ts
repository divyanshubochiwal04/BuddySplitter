import { describe, it, expect } from 'vitest';
import { AppError, ValidationError, NotFoundError } from './errors';

describe('Shared Errors', () => {
  it('creates AppError with defaults', () => {
    const error = new AppError('Something went wrong');
    expect(error.message).toBe('Something went wrong');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
  });

  it('creates ValidationError with details', () => {
    const error = new ValidationError('Invalid input', { field: 'amount' });
    expect(error.message).toBe('Invalid input');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'amount' });
  });

  it('creates NotFoundError with 404 code', () => {
    const error = new NotFoundError('User not found');
    expect(error.message).toBe('User not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
  });
});
