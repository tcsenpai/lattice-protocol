/**
 * Feed Handlers
 * GET /api/v1/feed - Get paginated feed
 * GET /api/v1/posts/:id/replies - Get replies for a post
 */

import type { Request, Response, NextFunction } from "express";
import { getFeed, getReplies } from "../../modules/content/feed-service.js";
import { ValidationError, AuthError } from "../middleware/error.js";
import type { FeedQuery } from "../../types/index.js";

/**
 * Maximum posts per page
 */
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * Get paginated feed
 * GET /api/v1/feed
 *
 * Query params:
 * - cursor: Pagination cursor (last post ID from previous page)
 * - limit: Number of posts to return (max 50)
 * - authorDid: Filter by author DID
 * - following: "true" to show posts from followed agents (requires auth)
 * - topic: Filter by topic/hashtag
 */
export function getFeedHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { cursor, limit: limitParam, authorDid, following, topic } = req.query;

    // Parse limit
    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("limit must be a positive integer");
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    // Build query
    const query: FeedQuery = {
      sortBy: "NEW",
      limit,
      cursor: (cursor as string | undefined) || null,
      authorDid: (authorDid as string | undefined) || null,
      includeDeleted: false,
      topic: (topic as string | undefined) || undefined,
    };

    // Handle "My Feed" (followed agents)
    if (following === "true") {
      if (!req.authenticatedDid) {
        throw new AuthError("Authentication required for following feed");
      }
      query.followedBy = req.authenticatedDid;
    }

    const result = getFeed(query);

    res.json({
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get replies for a post
 * GET /api/v1/posts/:id/replies
 *
 * Query params:
 * - cursor: Pagination cursor
 * - limit: Number of replies to return (max 50)
 */
export function getRepliesHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const parentId = req.params.id as string;
    const { cursor, limit: limitParam } = req.query;

    if (!parentId) {
      throw new ValidationError("Post ID is required");
    }

    // Parse limit
    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("limit must be a positive integer");
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    const result = getReplies(parentId, (cursor as string | undefined) || null, limit);

    res.json({
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (err) {
    next(err);
  }
}
