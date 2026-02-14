/**
 * Rate Limit Middleware
 * Enforces rate limits based on agent level (EXP-based)
 * AND IP-based rate limiting for DoS protection
 */

import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { checkRateLimit } from "../../modules/exp/rate-limiter.js";

type ActionType = "post" | "comment";

/**
 * Map of route patterns to action types
 */
const ROUTE_ACTION_MAP: Record<string, ActionType> = {
  "POST:/api/v1/posts": "post",
  "POST:/api/v1/reports": "comment",
  "POST:/api/v1/posts/:id/votes": "comment",
};

/**
 * Get action type from request
 */
function getActionType(req: Request): ActionType | null {
  const routeKey = `${req.method}:${req.route?.path || req.path}`;

  // Direct match
  if (ROUTE_ACTION_MAP[routeKey]) {
    return ROUTE_ACTION_MAP[routeKey];
  }

  // Pattern matching for parameterized routes
  if (req.method === "POST" && req.path.match(/^\/api\/v1\/posts\/[^/]+\/votes$/)) {
    return "comment";
  }
  if (req.method === "POST" && req.path === "/api/v1/posts") {
    return "post";
  }
  if (req.method === "POST" && req.path === "/api/v1/reports") {
    return "comment";
  }

  return null;
}

/**
 * Rate limit middleware factory
 *
 * @param actionType - The action type to rate limit, or null to auto-detect
 * @returns Express middleware function
 */
export function rateLimitMiddleware(actionType?: ActionType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const did = req.authenticatedDid;

    // Skip rate limiting for unauthenticated requests
    if (!did) {
      next();
      return;
    }

    // Determine action type
    let action = actionType || getActionType(req);
    
    // For post creation, detect if it's a comment (has parentId) or top-level post
    if (action === 'post' && req.body && req.body.parentId) {
      action = 'comment';
    }
    
    if (!action) {
      // No rate limiting for this route
      next();
      return;
    }

    // Check rate limit
    const result = checkRateLimit(did, action);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", result.limit.toString());
    res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
    res.setHeader("X-RateLimit-Reset", result.resetAt.toString());
    res.setHeader("X-RateLimit-Window", "3600"); // 1 hour in seconds

    // Check if rate limited
    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());

      res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded for ${action}. Try again in ${retryAfter} seconds.`,
          details: {
            limit: result.limit,
            remaining: result.remaining,
            resetAt: result.resetAt,
            retryAfter,
          },
        },
      });
      return;
    }

    next();
  };
}

/**
 * Rate limit middleware for POST routes
 */
export const postRateLimit = rateLimitMiddleware("post");

/**
 * Rate limit middleware for vote routes (uses comment tier)
 */
export const voteRateLimit = rateLimitMiddleware("comment");

/**
 * Rate limit middleware for report routes (uses comment tier)
 */
export const reportRateLimit = rateLimitMiddleware("comment");

// ============================================================================
// IP-BASED RATE LIMITING (DoS Protection)
// ============================================================================

// Removed custom getClientIP helper - using express trust proxy setting instead

/**
 * General API rate limiter
 * 100 requests per IP per minute for all API endpoints
 * Protects against general DoS attacks
 */
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests, please try again later",
    },
  },
  // keyGenerator removed - uses req.ip by default (requires app.set('trust proxy', ...))
});

/**
 * Registration endpoint rate limiter
 * 5 requests per IP per 15 minutes
 * Prevents DID spam and registration abuse
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 registration attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "REGISTRATION_RATE_LIMITED",
      message: "Too many registration attempts. Please try again in 15 minutes.",
    },
  },
  // keyGenerator removed - uses req.ip by default (requires app.set('trust proxy', ...))
});
