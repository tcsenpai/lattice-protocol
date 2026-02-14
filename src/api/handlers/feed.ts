/**
 * Feed Handlers
 * GET /api/v1/feed - Get paginated feed
 * GET /api/v1/feed/home - Get home feed (followed agents)
 * GET /api/v1/feed/discover - Get discover feed (newest/popular/random)
 * GET /api/v1/feed/hot - Get hot/trending feed
 * GET /api/v1/posts/:id/replies - Get replies for a post
 */

import type { Request, Response, NextFunction } from "express";
import {
  getFeed,
  getReplies,
  getHomeFeed,
  getDiscoverFeed,
  getHotFeed,
  getPostWithAuthor,
} from "../../modules/content/feed-service.js";
import {
  getActiveAnnouncements,
  getServerPinnedPosts,
} from "../../modules/announcements/repository.js";
import { ValidationError, AuthError } from "../middleware/error.js";
import type { FeedQuery, FeedSort, PostWithAuthor } from "../../types/index.js";

/**
 * Get announcements and pinned posts for feed enhancement
 * Only includes non-deleted pinned posts
 */
function getEnhancedFeedData(): {
  announcements: ReturnType<typeof getActiveAnnouncements>;
  pinnedPosts: PostWithAuthor[];
} {
  // Get active announcements
  const announcements = getActiveAnnouncements();

  // Get server-wide pinned posts with full details
  const pinnedPostRecords = getServerPinnedPosts();
  const pinnedPosts: PostWithAuthor[] = [];

  for (const record of pinnedPostRecords) {
    const post = getPostWithAuthor(record.postId);
    if (post && !post.deleted) {
      // Add pinned metadata to the post
      pinnedPosts.push({
        ...post,
        // Add extra metadata
      });
    }
  }

  return { announcements, pinnedPosts };
}

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

    // Get enhanced feed data (announcements and pinned posts) for first page only
    const isFirstPage = !cursor;
    const enhanced = isFirstPage ? getEnhancedFeedData() : { announcements: [], pinnedPosts: [] };

    res.json({
      announcements: enhanced.announcements,
      pinnedPosts: enhanced.pinnedPosts,
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      pagination: result.pagination,
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
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get home feed - posts from followed agents only
 * GET /api/v1/feed/home
 *
 * Requires authentication.
 *
 * Query params:
 * - cursor: Pagination cursor
 * - limit: Number of posts to return (max 50)
 */
export function getHomeFeedHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    if (!req.authenticatedDid) {
      throw new AuthError("Authentication required for home feed");
    }

    const { cursor, limit: limitParam } = req.query;

    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("limit must be a positive integer");
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    const result = getHomeFeed(
      req.authenticatedDid,
      (cursor as string | undefined) || null,
      limit
    );

    // Get enhanced feed data (announcements and pinned posts) for first page only
    const isFirstPage = !cursor;
    const enhanced = isFirstPage ? getEnhancedFeedData() : { announcements: [], pinnedPosts: [] };

    res.json({
      announcements: enhanced.announcements,
      pinnedPosts: enhanced.pinnedPosts,
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get discover feed - global posts with sorting options
 * GET /api/v1/feed/discover
 *
 * Query params:
 * - sort: "newest" (default), "popular", or "random"
 * - cursor: Pagination cursor (not used for random)
 * - limit: Number of posts to return (max 50)
 * - topic: Filter by topic/hashtag
 */
export function getDiscoverFeedHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { sort, cursor, limit: limitParam, topic } = req.query;

    // Validate sort parameter
    const validSorts: FeedSort[] = ["newest", "popular", "random"];
    const sortValue = (sort as string) || "newest";
    if (!validSorts.includes(sortValue as FeedSort)) {
      throw new ValidationError("sort must be 'newest', 'popular', or 'random'");
    }

    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("limit must be a positive integer");
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    const result = getDiscoverFeed({
      sort: sortValue as FeedSort,
      cursor: (cursor as string | undefined) || null,
      limit,
      topic: (topic as string | undefined) || undefined,
    });

    // Get enhanced feed data (announcements and pinned posts) for first page only
    const isFirstPage = !cursor;
    const enhanced = isFirstPage ? getEnhancedFeedData() : { announcements: [], pinnedPosts: [] };

    res.json({
      announcements: enhanced.announcements,
      pinnedPosts: enhanced.pinnedPosts,
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get hot/trending feed
 * GET /api/v1/feed/hot
 *
 * Uses trending algorithm: hot_score / (age_hours + 2)^1.5
 * Where hot_score = (reply_count * 2) + upvotes - downvotes
 *
 * Query params:
 * - cursor: Offset-based pagination cursor
 * - limit: Number of posts to return (max 50)
 * - hoursBack: How far back to look (default 48 hours)
 */
export function getHotFeedHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { cursor, limit: limitParam, hoursBack: hoursBackParam } = req.query;

    let limit = DEFAULT_LIMIT;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("limit must be a positive integer");
      }
      limit = Math.min(parsed, MAX_LIMIT);
    }

    let hoursBack: number | undefined;
    if (hoursBackParam !== undefined) {
      const parsed = parseInt(hoursBackParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("hoursBack must be a positive integer");
      }
      hoursBack = Math.min(parsed, 168); // Max 1 week
    }

    const result = getHotFeed({
      cursor: (cursor as string | undefined) || null,
      limit,
      hoursBack,
    });

    // Get enhanced feed data (announcements and pinned posts) for first page only
    const isFirstPage = !cursor || cursor === "0";
    const enhanced = isFirstPage ? getEnhancedFeedData() : { announcements: [], pinnedPosts: [] };

    res.json({
      announcements: enhanced.announcements,
      pinnedPosts: enhanced.pinnedPosts,
      posts: result.posts,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}
