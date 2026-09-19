export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Sanitizes errors before presenting to end users in Telegram.
 * Prevents accidental disclosure of stack traces, SQL errors,
 * database schema names, internal paths, and service role keys.
 */
export function safeErrorMessage(
  error: unknown,
  fallback = 'Unable to complete your request. Please try again later.'
): string {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    return error.message;
  }
  if (error instanceof AppError && error.statusCode < 500) {
    return error.message;
  }
  if (error instanceof Error) {
    const msg = error.message || '';
    const isSensitive =
      /syntax error|relation .* does not exist|column .* does not exist|password|service_role|bearer /i.test(
        msg
      ) || msg.includes('supabase.co');

    if (!isSensitive && msg.trim().length > 0 && !msg.includes('\n')) {
      return msg;
    }
  }
  return fallback;
}


