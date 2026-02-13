/**
 * Error Handler Middleware
 * Provides consistent error response format
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Base API error class
 */
export class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "APIError";
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends APIError {
  constructor(resource: string, id?: string) {
    super(
      "NOT_FOUND",
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      404
    );
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends APIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

/**
 * Authentication error (401)
 */
export class AuthError extends APIError {
  constructor(message: string = "Authentication required") {
    super("AUTH_ERROR", message, 401);
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends APIError {
  constructor(retryAfter: number) {
    super("RATE_LIMIT_EXCEEDED", `Rate limit exceeded. Retry after ${retryAfter} seconds.`, 429, {
      retryAfter,
    });
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends APIError {
  constructor(message: string = "Access denied") {
    super("FORBIDDEN", message, 403);
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends APIError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

/**
 * Error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Map known errors to HTTP status codes
 */
function mapErrorToStatus(err: Error): number {
  if (err instanceof APIError) {
    return err.statusCode;
  }

  // Map common error messages to status codes
  const message = err.message.toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("invalid") || message.includes("required")) return 400;
  if (message.includes("unauthorized") || message.includes("authentication")) return 401;
  if (message.includes("forbidden") || message.includes("permission")) return 403;
  if (message.includes("conflict") || message.includes("already exists")) return 409;
  if (message.includes("rate limit")) return 429;

  return 500;
}

/**
 * Format error for response
 */
function formatError(err: Error): ErrorResponse {
  if (err instanceof APIError) {
    return {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    };
  }

  // Generic errors
  return {
    error: {
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === "production"
        ? "An internal error occurred"
        : err.message,
    },
  };
}

/**
 * Log error with context
 */
function logError(err: Error, req: Request): void {
  const context = {
    method: req.method,
    url: req.originalUrl,
    did: req.authenticatedDid || "anonymous",
    timestamp: new Date().toISOString(),
  };

  if (err instanceof APIError && err.statusCode < 500) {
    // Client errors - debug level
    console.debug("[API Error]", err.code, err.message, context);
  } else {
    // Server errors - error level
    console.error("[API Error]", err.name, err.message, context, err.stack);
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logError(err, req);

  const statusCode = mapErrorToStatus(err);
  const errorResponse = formatError(err);

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}
