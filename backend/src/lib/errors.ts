/**
 * Application error type carrying an HTTP status + stable machine code.
 *
 * Isolation invariant (Principle II): a request for a non-owned OR non-existent
 * resource must produce the SAME 404 NOT_FOUND — never reveal which. Always use
 * {@link notFound} for both cases so the response is uniform.
 */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'VALIDATION'
  | 'PAYLOAD_TOO_LARGE'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Uniform not-found used for BOTH missing and non-owned resources. */
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);
export const conflict = (message = 'Conflict') => new AppError(409, 'CONFLICT', message);
export const badRequest = (message = 'Bad request') => new AppError(400, 'BAD_REQUEST', message);
export const validationError = (message = 'Invalid input') => new AppError(400, 'VALIDATION', message);
export const payloadTooLarge = (message = 'Payload too large') =>
  new AppError(413, 'PAYLOAD_TOO_LARGE', message);
export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'TOO_MANY_REQUESTS', message);

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
