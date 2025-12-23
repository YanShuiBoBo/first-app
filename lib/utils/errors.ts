export class ApiError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthError extends ApiError {
  constructor(message = '未授权') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class CloudflareError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'CLOUDFLARE_ERROR', 502, details);
  }
}

export class DatabaseError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
  }
}