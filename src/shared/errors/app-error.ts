export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: ErrorCode;
      details?: unknown;
      isOperational?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(message, { statusCode: 400, code: 'BAD_REQUEST', details });
  }

  static notFound(message: string, details?: unknown) {
    return new AppError(message, { statusCode: 404, code: 'NOT_FOUND', details });
  }

  static upstream(message: string, details?: unknown) {
    return new AppError(message, { statusCode: 502, code: 'UPSTREAM_ERROR', details });
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, { statusCode: 401, code: 'UNAUTHORIZED' });
  }
}
