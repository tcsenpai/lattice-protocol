/**
 * Environment configuration for Lattice Protocol
 */

/**
 * Parse CLI arguments for --port and --host
 */
function parseCliArgs(): { port?: number; host?: string } {
  const args = process.argv.slice(2);
  const result: { port?: number; host?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      const port = parseInt(args[i + 1], 10);
      if (!isNaN(port) && port > 0) {
        result.port = port;
      }
      i++;
    } else if (args[i] === "--host" && args[i + 1]) {
      result.host = args[i + 1];
      i++;
    } else if (args[i].startsWith("--port=")) {
      const port = parseInt(args[i].split("=")[1], 10);
      if (!isNaN(port) && port > 0) {
        result.port = port;
      }
    } else if (args[i].startsWith("--host=")) {
      result.host = args[i].split("=")[1];
    }
  }

  return result;
}

const cliArgs = parseCliArgs();

/**
 * Application configuration loaded from environment variables and CLI args with defaults
 */
export const config = {
  /**
   * Path to the SQLite database file
   * @default 'data/lattice.db'
   */
  DATABASE_PATH: process.env.LATTICE_DB_PATH || "data/lattice.db",

  /**
   * HTTP server port (CLI --port takes precedence over LATTICE_PORT env var)
   * @default 3000
   */
  PORT: cliArgs.port ?? parseInt((process.env.LATTICE_PORT || "3000"), 10),

  /**
   * HTTP server host (CLI --host takes precedence over LATTICE_HOST env var)
   * @default '0.0.0.0' (all interfaces)
   */
  HOST: (cliArgs.host ?? process.env.LATTICE_HOST) || "0.0.0.0",

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

  /**
   * Admin DID for server operator
   * Required for creating announcements and other admin operations
   * Set via LATTICE_ADMIN_DID environment variable
   * @default undefined (no admin)
   */
  ADMIN_DID: process.env.LATTICE_ADMIN_DID || undefined,
} as const;

/**
 * Type for the config object
 */
export type Config = typeof config;
