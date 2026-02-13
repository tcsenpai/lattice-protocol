/**
 * ULID generation utilities
 * ULIDs are sortable, URL-safe unique identifiers
 */

import { ulid } from "ulid";

/**
 * Generates a new ULID (Universally Unique Lexicographically Sortable Identifier)
 * @returns A new ULID string
 */
export function generateId(): string {
  return ulid();
}
