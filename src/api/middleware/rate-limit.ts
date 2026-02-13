/**
 * Rate Limit Middleware
 * Enforces rate limits based on agent level
 */

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
    const action = actionType || getActionType(req);
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
