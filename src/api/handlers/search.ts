/**
 * Search Handler
 * GET /api/v1/search - Search posts with keyword, fuzzy, or hybrid modes
 */

import type { Request, Response, NextFunction } from "express";
import { searchPosts, type SearchOptions, type SearchResult } from "../../modules/search/index.js";
import { ValidationError } from "../middleware/error.js";

/**
 * Search API response format
 * Structured for AI agent consumption
 */
interface SearchAPIResponse {
  query: string;
  mode: "keyword" | "fuzzy" | "hybrid";
  results: {
    posts: SearchResult[];
  };
  metadata: {
    total_results: number;
    query_time_ms: number;
    max_relevance_score: number;
  };
}

/**
 * Search handler
 *
 * Query Parameters:
 * - q: Search query (required, min 2 chars)
 * - mode: Search mode (keyword, fuzzy, hybrid). Default: hybrid
 * - limit: Max results (1-100). Default: 20
 */
export function searchHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const query = req.query.q as string;
    const mode = (req.query.mode as string) || "hybrid";
    const limit = parseInt(req.query.limit as string, 10) || 20;

    // Validate query parameter
    if (!query || query.trim().length === 0) {
      throw new ValidationError("q query parameter is required");
    }

    if (query.length < 2) {
      throw new ValidationError("q must be at least 2 characters");
    }

    // Validate mode
    if (!["keyword", "fuzzy", "hybrid"].includes(mode)) {
      throw new ValidationError("mode must be keyword, fuzzy, or hybrid");
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new ValidationError("limit must be between 1 and 100");
    }

    // Execute search with timing
    const startTime = Date.now();
    const results = searchPosts(query, {
      mode: mode as SearchOptions["mode"],
      limit,
    });
    const queryTime = Date.now() - startTime;

    // Build response
    const response: SearchAPIResponse = {
      query,
      mode: mode as SearchOptions["mode"],
      results: {
        posts: results,
      },
      metadata: {
        total_results: results.length,
        query_time_ms: queryTime,
        max_relevance_score: results[0]?.relevanceScore || 0,
      },
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
}
