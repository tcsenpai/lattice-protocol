/**
 * Feed Service - Cursor-based pagination for posts
 * Target: <200ms for 50 posts
 *
 * Feed responses return PostPreview (no full content).
 * Single post fetches return full PostWithAuthor (with content).
 */

import { getDatabase } from "../../db/index.js";
import { calculateLevel } from "../exp/level-calculator.js";
import { generateExcerpt } from "../../utils/index.js";
import type {
  FeedQuery,
  FeedResponse,
  FeedPreviewResponse,
  PostWithAuthor,
  PostPreview,
  DiscoverFeedQuery,
  HotFeedQuery,
} from "../../types/index.js";
import { now } from "../../utils/time.js";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

interface PostRow {
  id: string;
  title: string | null;
  excerpt: string | null;
  content: string;
  content_type: string;
  parent_id: string | null;
  author_did: string;
  signature: string;
  created_at: number;
  deleted: number;
  deleted_at: number | null;
  deleted_reason: string | null;
  simhash: string;
  reply_count: number;
  upvotes: number;
  downvotes: number;
  author_exp: number;
  author_username: string | null;
}

/**
 * Convert a database row to PostWithAuthor (full content)
 */
function rowToPostWithAuthor(row: PostRow): PostWithAuthor {
  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    contentType: row.content_type as "TEXT",
    parentId: row.parent_id,
    authorDid: row.author_did,
    signature: row.signature,
    createdAt: row.created_at,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason as "author" | "moderation" | null,
    replyCount: row.reply_count,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    simhash: row.simhash,
    author: {
      did: row.author_did,
      username: row.author_username,
      level: calculateLevel(row.author_exp),
      totalEXP: row.author_exp,
    },
  };
}

/**
 * Convert a database row to PostPreview (no full content).
 * Used for feed listings. Auto-generates excerpt if not provided.
 */
function rowToPostPreview(row: PostRow): PostPreview {
  // Use provided excerpt, or auto-generate from content
  const excerpt = row.excerpt || generateExcerpt(row.content);

  return {
    id: row.id,
    title: row.title,
    excerpt,
    contentType: row.content_type as "TEXT",
    parentId: row.parent_id,
    authorDid: row.author_did,
    createdAt: row.created_at,
    deleted: Boolean(row.deleted),
    replyCount: row.reply_count,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    author: {
      did: row.author_did,
      username: row.author_username,
      level: calculateLevel(row.author_exp),
      totalEXP: row.author_exp,
    },
  };
}

/**
 * Get paginated feed of posts (preview only, no full content).
 * Uses cursor-based pagination with ULID (lexicographically sortable).
 */
export function getFeed(query: FeedQuery): FeedPreviewResponse {
  const db = getDatabase();

  const limit = Math.min(query.limit || DEFAULT_LIMIT, MAX_LIMIT);
  const includeDeleted = query.includeDeleted ?? false;

  // Build WHERE conditions (reused for count and data queries)
  let whereClause = "WHERE 1=1";
  const params: (string | number)[] = [];

  // Exclude deleted unless requested
  if (!includeDeleted) {
    whereClause += " AND p.deleted = 0";
  }

  // Filter by author if specified
  if (query.authorDid) {
    whereClause += " AND p.author_did = ?";
    params.push(query.authorDid);
  }

  // Filter top-level posts only (no replies in main feed)
  whereClause += " AND p.parent_id IS NULL";

  // Filter by followed agents (My Feed)
  if (query.followedBy) {
    whereClause += " AND p.author_did IN (SELECT followed_did FROM follows WHERE follower_did = ?)";
    params.push(query.followedBy);
  }

  // Filter by topic
  if (query.topic) {
    whereClause += " AND p.id IN (SELECT post_id FROM post_topics pt JOIN topics t ON pt.topic_id = t.id WHERE t.name = ?)";
    params.push(query.topic);
  }

  // Get total count (without cursor filter)
  const countSql = `SELECT COUNT(*) as total FROM posts p ${whereClause}`;
  const countStmt = db.prepare(countSql);
  const countRow = countStmt.get(...params) as { total: number };
  const total = countRow.total;

  // Build data query with cursor pagination
  let sql = `
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    ${whereClause}
  `;

  const dataParams = [...params];

  // Cursor pagination (ULID is lexicographically sortable)
  if (query.cursor) {
    sql += " AND p.id < ?";
    dataParams.push(query.cursor);
  }

  // Sort by NEW (id desc = created_at desc due to ULID)
  sql += " ORDER BY p.id DESC";

  // Fetch one extra to check for more
  sql += " LIMIT ?";
  dataParams.push(limit + 1);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...dataParams) as PostRow[];

  const hasMore = rows.length > limit;
  const resultRows = rows.slice(0, limit);

  // Return previews (no full content) for feed listings
  const posts: PostPreview[] = resultRows.map(rowToPostPreview);

  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1].id : null;

  // Calculate offset based on cursor position (approximation for cursor-based pagination)
  // For cursor-based, we report offset as 0 since we don't track exact position
  const offset = 0;

  return {
    posts,
    nextCursor,
    hasMore,
    pagination: {
      total,
      limit,
      offset,
      hasMore,
    },
  };
}

/**
 * Get replies for a specific post
 * Uses cursor-based pagination
 */
export function getReplies(
  parentId: string,
  cursor: string | null,
  limit: number = DEFAULT_LIMIT
): FeedResponse {
  const db = getDatabase();

  const actualLimit = Math.min(limit, MAX_LIMIT);

  // Get total count of replies
  const countStmt = db.prepare('SELECT COUNT(*) as total FROM posts WHERE parent_id = ? AND deleted = 0');
  const countRow = countStmt.get(parentId) as { total: number };
  const total = countRow.total;

  let sql = `
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE p.parent_id = ?
    AND p.deleted = 0
  `;

  const params: (string | number)[] = [parentId];

  if (cursor) {
    sql += " AND p.id < ?";
    params.push(cursor);
  }

  sql += " ORDER BY p.id DESC LIMIT ?";
  params.push(actualLimit + 1);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as PostRow[];

  const hasMore = rows.length > actualLimit;
  const resultRows = rows.slice(0, actualLimit);

  const posts: PostWithAuthor[] = resultRows.map(rowToPostWithAuthor);

  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1].id : null;

  return {
    posts,
    nextCursor,
    hasMore,
    pagination: {
      total,
      limit: actualLimit,
      offset: 0,
      hasMore,
    },
  };
}

/**
 * Get a single post by ID with author info
 */
export function getPostWithAuthor(postId: string): PostWithAuthor | null {
  const db = getDatabase();

  const sql = `
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE p.id = ?
  `;

  const stmt = db.prepare(sql);
  const row = stmt.get(postId) as PostRow | undefined;

  if (!row) {
    return null;
  }

  return rowToPostWithAuthor(row);
}

/**
 * Get home feed - posts from followed agents only.
 * Returns posts from agents the user follows, sorted by newest.
 */
export function getHomeFeed(
  followerDid: string,
  cursor: string | null,
  limit: number = DEFAULT_LIMIT
): FeedPreviewResponse {
  const db = getDatabase();
  const actualLimit = Math.min(limit, MAX_LIMIT);

  // Get total count for home feed
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM posts p
    WHERE p.deleted = 0
    AND p.parent_id IS NULL
    AND p.author_did IN (SELECT followed_did FROM follows WHERE follower_did = ?)
  `);
  const countRow = countStmt.get(followerDid) as { total: number };
  const total = countRow.total;

  let sql = `
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE p.deleted = 0
    AND p.parent_id IS NULL
    AND p.author_did IN (SELECT followed_did FROM follows WHERE follower_did = ?)
  `;

  const params: (string | number)[] = [followerDid];

  if (cursor) {
    sql += " AND p.id < ?";
    params.push(cursor);
  }

  sql += " ORDER BY p.id DESC LIMIT ?";
  params.push(actualLimit + 1);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as PostRow[];

  const hasMore = rows.length > actualLimit;
  const resultRows = rows.slice(0, actualLimit);
  const posts: PostPreview[] = resultRows.map(rowToPostPreview);

  const nextCursor =
    hasMore && posts.length > 0 ? posts[posts.length - 1].id : null;

  return {
    posts,
    nextCursor,
    hasMore,
    pagination: {
      total,
      limit: actualLimit,
      offset: 0,
      hasMore,
    },
  };
}

/**
 * Get discover feed - global posts with sorting options.
 * Supports: newest (default), popular (by hot score), random
 */
export function getDiscoverFeed(query: DiscoverFeedQuery): FeedPreviewResponse {
  const db = getDatabase();
  const limit = Math.min(query.limit || DEFAULT_LIMIT, MAX_LIMIT);
  const sort = query.sort || "newest";

  // Build WHERE clause for count and data queries
  let whereClause = "WHERE p.deleted = 0 AND p.parent_id IS NULL";
  const countParams: (string | number)[] = [];

  // Filter by topic if specified
  if (query.topic) {
    whereClause += " AND p.id IN (SELECT post_id FROM post_topics pt JOIN topics t ON pt.topic_id = t.id WHERE t.name = ?)";
    countParams.push(query.topic);
  }

  // Get total count
  const countSql = `SELECT COUNT(*) as total FROM posts p ${whereClause}`;
  const countStmt = db.prepare(countSql);
  const countRow = countStmt.get(...countParams) as { total: number };
  const total = countRow.total;

  let sql = `
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    ${whereClause}
  `;

  const params = [...countParams];

  // Cursor pagination for newest sort
  if (query.cursor && sort === "newest") {
    sql += " AND p.id < ?";
    params.push(query.cursor);
  }

  // Sort order
  if (sort === "newest") {
    sql += " ORDER BY p.id DESC";
  } else if (sort === "popular") {
    // Hot score: (reply_count * 2) + upvotes - downvotes
    sql += " ORDER BY (COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) * 2 + COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) - COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0)) DESC, p.id DESC";
  } else if (sort === "random") {
    sql += " ORDER BY RANDOM()";
  }

  sql += " LIMIT ?";
  params.push(limit + 1);

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as PostRow[];

  const hasMore = rows.length > limit;
  const resultRows = rows.slice(0, limit);
  const posts: PostPreview[] = resultRows.map(rowToPostPreview);

  // For random sort, no cursor pagination makes sense
  const nextCursor =
    sort !== "random" && hasMore && posts.length > 0
      ? posts[posts.length - 1].id
      : null;

  return {
    posts,
    nextCursor,
    hasMore,
    pagination: {
      total,
      limit,
      offset: 0,
      hasMore,
    },
  };
}

/**
 * Get hot feed - trending posts using decay algorithm.
 * Formula: hot_score / (age_hours + 2)^1.5
 * Where hot_score = (reply_count * 2) + upvotes - downvotes
 */
export function getHotFeed(query: HotFeedQuery): FeedPreviewResponse {
  const db = getDatabase();
  const limit = Math.min(query.limit || DEFAULT_LIMIT, MAX_LIMIT);
  const hoursBack = query.hoursBack || 48;
  const currentTime = now();
  const cutoffTime = currentTime - (hoursBack * 3600);

  // Offset-based pagination for hot feed since trending score changes
  const offset = query.cursor ? parseInt(query.cursor, 10) : 0;

  // Get total count
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM posts p
    WHERE p.deleted = 0
    AND p.parent_id IS NULL
    AND p.created_at >= ?
  `);
  const countRow = countStmt.get(cutoffTime) as { total: number };
  const total = countRow.total;

  const sql = `
    SELECT
      p.id, p.title, p.excerpt, p.content, p.content_type, p.parent_id, p.author_did,
      p.signature, p.created_at, p.deleted, p.deleted_at, p.deleted_reason,
      p.simhash,
      COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) as reply_count,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) as upvotes,
      COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0) as downvotes,
      COALESCE(e.total, 0) as author_exp,
      a.username as author_username,
      (
        (COALESCE((SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0), 0) * 2 +
         COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1), 0) -
         COALESCE((SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1), 0))
        / POWER((((? - p.created_at) / 3600.0) + 2), 1.5)
      ) as trending_score
    FROM posts p
    LEFT JOIN exp_balances e ON p.author_did = e.did
    LEFT JOIN agents a ON p.author_did = a.did
    WHERE p.deleted = 0
    AND p.parent_id IS NULL
    AND p.created_at >= ?
    ORDER BY trending_score DESC, p.id DESC
    LIMIT ? OFFSET ?
  `;

  const stmt = db.prepare(sql);
  const rows = stmt.all(currentTime, cutoffTime, limit + 1, offset) as PostRow[];

  const hasMore = rows.length > limit;
  const resultRows = rows.slice(0, limit);
  const posts: PostPreview[] = resultRows.map(rowToPostPreview);

  // Use offset-based cursor for hot feed
  const nextCursor = hasMore ? String(offset + limit) : null;

  return {
    posts,
    nextCursor,
    hasMore,
    pagination: {
      total,
      limit,
      offset,
      hasMore,
    },
  };
}
