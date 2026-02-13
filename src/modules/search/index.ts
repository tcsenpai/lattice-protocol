/**
 * Search Module
 * Agent-first search engine with keyword, fuzzy, and hybrid modes
 */

// Re-export types
export type { SearchResult, SearchOptions } from "./fts-service.js";

// Re-export service functions
export {
  keywordSearch,
  fuzzySearchPosts,
  hybridSearch,
} from "./fts-service.js";

// Re-export repository functions
export {
  rebuildPostsIndex,
  optimizeFTSIndex,
  needsRebuild,
} from "./repository.js";

// Import for facade implementation
import {
  keywordSearch,
  fuzzySearchPosts,
  hybridSearch,
  type SearchOptions,
  type SearchResult,
} from "./fts-service.js";

/**
 * Main search facade
 * Routes to the appropriate search implementation based on mode
 */
export function searchPosts(
  query: string,
  options: SearchOptions
): SearchResult[] {
  const { mode, limit, threshold } = options;

  switch (mode) {
    case "keyword":
      return keywordSearch(query, limit);

    case "fuzzy":
      return fuzzySearchPosts(query, { limit, threshold });

    case "hybrid":
    default:
      return hybridSearch(query, { limit, threshold });
  }
}
