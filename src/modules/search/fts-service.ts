/**
 * FTS Service
 * Full-text search implementation using SQLite FTS5 and fast-fuzzy
 */

import { search as fuzzySearch } from "fast-fuzzy";
import { getDatabase } from "../../db/index.js";

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
  id: string;
  content: string;
  authorDid: string;
  authorUsername: string | null;
  relevanceScore: number;
  snippet: string;
  replyCount: number;
  upvotes: number;
  downvotes: number;
}

export interface SearchOptions {
  mode: "keyword" | "fuzzy" | "hybrid";
  limit: number;
  threshold?: number;
}

// Internal type for database row
interface PostRow {
  id: string;
  content: string;
  author_did: string;
  author_username: string | null;
  reply_count: number;
  upvotes: number;
  downvotes: number;
}

interface FTSRow extends PostRow {
  relevance_score: number;
  snippet: string;
}

// ============================================================================
// Query Sanitization
// ============================================================================

/**
 * Sanitize user input for safe FTS5 query execution
 * Handles: trailing operators, special chars, quote escaping
 */
function sanitizeFTSQuery(query: string): string {
  // Trim whitespace
  query = query.trim();

  // Remove trailing boolean operators
  query = query.replace(/\s+(AND|OR|NOT)\s*$/i, "");

  // Escape double quotes
  query = query.replace(/"/g, '""');

  // Remove standalone special chars that break FTS5
  query = query.replace(/[*^$]/g, "");

  // Handle empty query after sanitization
  if (query.length === 0) {
    return '""';
  }

  // Wrap in quotes for phrase matching
  return `"${query}"`;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Keyword search using FTS5 MATCH with BM25 ranking
 * Returns results sorted by relevance score
 */
export function keywordSearch(query: string, limit: number = 20): SearchResult[] {
  const db = getDatabase();
  const sanitizedQuery = sanitizeFTSQuery(query);

  try {
    const rows = db
      .prepare(
        `
        SELECT
          posts_fts.id,
          posts_fts.content,
          posts_fts.author_did,
          a.username as author_username,
          (SELECT COUNT(*) FROM posts WHERE parent_id = posts_fts.id AND deleted = 0) as reply_count,
          (SELECT COUNT(*) FROM votes WHERE post_id = posts_fts.id AND value = 1) as upvotes,
          (SELECT COUNT(*) FROM votes WHERE post_id = posts_fts.id AND value = -1) as downvotes,
          bm25(posts_fts) * -1 as relevance_score,
          snippet(posts_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
        FROM posts_fts
        LEFT JOIN agents a ON posts_fts.author_did = a.did
        WHERE posts_fts MATCH ?
        ORDER BY relevance_score DESC
        LIMIT ?
      `
      )
      .all(sanitizedQuery, limit) as FTSRow[];

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      authorDid: row.author_did,
      authorUsername: row.author_username,
      relevanceScore: row.relevance_score,
      snippet: row.snippet,
      replyCount: row.reply_count,
      upvotes: row.upvotes,
      downvotes: row.downvotes,
    }));
  } catch (error) {
    // Handle FTS5 query errors gracefully
    console.error("[search] FTS5 query error:", error);
    return [];
  }
}

/**
 * Fuzzy search using fast-fuzzy for typo tolerance
 * Fetches recent posts and applies fuzzy matching
 */
export function fuzzySearchPosts(
  query: string,
  options: Pick<SearchOptions, "limit" | "threshold">
): SearchResult[] {
  const db = getDatabase();
  const { limit = 20, threshold = 0.5 } = options;

  // Fetch recent posts for fuzzy matching
  // Limit to 500 to balance performance vs coverage
  const posts = db
    .prepare(
      `
      SELECT 
        p.id, p.content, p.author_did, a.username as author_username,
        (SELECT COUNT(*) FROM posts WHERE parent_id = p.id AND deleted = 0) as reply_count,
        (SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = 1) as upvotes,
        (SELECT COUNT(*) FROM votes WHERE post_id = p.id AND value = -1) as downvotes
      FROM posts p
      LEFT JOIN agents a ON p.author_did = a.did
      WHERE p.deleted = 0
      ORDER BY p.created_at DESC
      LIMIT 500
    `
    )
    .all() as PostRow[];

  // Apply fuzzy search
  const results = fuzzySearch(query, posts, {
    keySelector: (post) => post.content,
    threshold,
    returnMatchData: true,
  });

  // Map to SearchResult format
  return results.slice(0, limit).map((match) => {
    const post = match.item;
    return {
      id: post.id,
      content: post.content,
      authorDid: post.author_did,
      authorUsername: post.author_username,
      relevanceScore: match.score,
      snippet: createSnippet(post.content, query),
      replyCount: post.reply_count,
      upvotes: post.upvotes,
      downvotes: post.downvotes,
    };
  });
}

/**
 * Hybrid search combining keyword and fuzzy results
 * Merges, deduplicates, and re-ranks by combined score
 */
export function hybridSearch(
  query: string,
  options: Pick<SearchOptions, "limit" | "threshold">
): SearchResult[] {
  const { limit = 20, threshold = 0.5 } = options;

  // Run both search methods
  const keywordResults = keywordSearch(query, 50);
  const fuzzyResults = fuzzySearchPosts(query, { limit: 50, threshold });

  // Merge and deduplicate by id
  const resultMap = new Map<string, SearchResult>();

  // Add keyword results (higher weight)
  for (const result of keywordResults) {
    resultMap.set(result.id, {
      ...result,
      relevanceScore: result.relevanceScore * 1.5, // Boost keyword matches
    });
  }

  // Add or merge fuzzy results
  for (const result of fuzzyResults) {
    const existing = resultMap.get(result.id);
    if (existing) {
      // Combine scores for results found by both methods
      existing.relevanceScore += result.relevanceScore;
    } else {
      resultMap.set(result.id, result);
    }
  }

  // Sort by combined score and return top N
  return Array.from(resultMap.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a snippet from content, highlighting the query term
 */
function createSnippet(content: string, query: string, maxLength: number = 150): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Find the query position
  const position = lowerContent.indexOf(lowerQuery);

  if (position === -1) {
    // Query not found directly, return start of content
    return content.length > maxLength
      ? content.slice(0, maxLength) + "..."
      : content;
  }

  // Calculate snippet window around the match
  const start = Math.max(0, position - 40);
  const end = Math.min(content.length, position + query.length + 60);

  let snippet = content.slice(start, end);

  // Add ellipsis if truncated
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}
