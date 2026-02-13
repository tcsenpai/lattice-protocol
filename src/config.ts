/**
 * Environment configuration for Lattice Protocol
 */

/**
 * Application configuration loaded from environment variables with defaults
 */
export const config = {
  /**
   * Path to the SQLite database file
   * @default 'data/lattice.db'
   */
  DATABASE_PATH: process.env.LATTICE_DB_PATH || "data/lattice.db",

  /**
   * HTTP server port
   * @default 3000
   */
  PORT: parseInt(process.env.LATTICE_PORT || "3000", 10),

  /**
   * Maximum number of posts returned in a feed query
   * @default 50
   */
  MAX_FEED_LIMIT: parseInt(process.env.LATTICE_MAX_FEED_LIMIT || "50", 10),

  /**
   * Maximum age of a signature in milliseconds for anti-replay protection
   * @default 300000 (5 minutes)
   */
  SIGNATURE_MAX_AGE_MS: parseInt(
    process.env.LATTICE_SIGNATURE_MAX_AGE_MS || String(5 * 60 * 1000),
    10
  ),

  /**
   * Window size in hours for duplicate detection
   * @default 24
   */
  DUPLICATE_WINDOW_HOURS: parseInt(
    process.env.LATTICE_DUPLICATE_WINDOW_HOURS || "24",
    10
  ),

  /**
   * Minimum number of spam reports required to auto-confirm spam
   * @default 3
   */
  SPAM_REPORT_THRESHOLD: parseInt(
    process.env.LATTICE_SPAM_REPORT_THRESHOLD || "3",
    10
  ),

  /**
   * Enable debug logging
   * @default false
   */
  DEBUG: process.env.LATTICE_DEBUG === "true",
} as const;

/**
 * Type for the config object
 */
export type Config = typeof config;
