/**
 * Rate Limiter
 * Sliding window rate limiting based on agent level
 */

import { getDatabase } from '../../db/index.js';
import { now } from '../../utils/time.js';
import { getBalance } from './repository.js';
import { calculateLevel, getLevelTier } from './level-calculator.js';
import { RATE_LIMITS, type RateLimitResult } from '../../types/index.js';

/**
 * Window duration in seconds (1 hour)
 */
const WINDOW_SECONDS = 3600;

/**
 * Check rate limit for an action.
 * Uses sliding window algorithm with hourly buckets.
 *
 * @param did - The agent's DID
 * @param actionType - The type of action ('post' or 'comment')
 * @returns RateLimitResult with allowed status, remaining count, reset time, and limit
 */
export function checkRateLimit(
  did: string,
  actionType: 'post' | 'comment'
): RateLimitResult {
  const db = getDatabase();

  // Get agent's level from EXP balance
  const balance = getBalance(did);
  const total = balance?.total ?? 0;
  const level = calculateLevel(total);
  const tier = getLevelTier(level);

  // Get limit for tier and action
  const tierLimits = RATE_LIMITS[tier];
  const limit = actionType === 'post' ? tierLimits.posts : tierLimits.comments;

  // -1 means unlimited
  if (limit === -1) {
    return {
      allowed: true,
      remaining: -1,
      resetAt: 0,
      limit: -1
    };
  }

  // Calculate current window boundaries
  const currentTime = now();
  const windowStart = currentTime - (currentTime % WINDOW_SECONDS);
  const resetAt = windowStart + WINDOW_SECONDS;

  // Get current count in sliding window (current + previous bucket for overlap)
  // We look back one full window to implement sliding window behavior
  const countStmt = db.prepare(`
    SELECT COALESCE(SUM(count), 0) as total
    FROM rate_limits
    WHERE did = ?
    AND action_type = ?
    AND window_start >= ?
  `);

  const row = countStmt.get(did, actionType, windowStart - WINDOW_SECONDS) as { total: number };
  const currentCount = row.total;

  const remaining = Math.max(0, limit - currentCount);
  const allowed = remaining > 0;

  return {
    allowed,
    remaining,
    resetAt,
    limit
  };
}

/**
 * Record an action for rate limiting.
 * Call this after an action succeeds to update the rate limit counter.
 *
 * @param did - The agent's DID
 * @param actionType - The type of action ('post' or 'comment')
 */
export function recordAction(
  did: string,
  actionType: 'post' | 'comment'
): void {
  const db = getDatabase();
  const currentTime = now();
  const windowStart = currentTime - (currentTime % WINDOW_SECONDS);

  const stmt = db.prepare(`
    INSERT INTO rate_limits (did, action_type, window_start, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(did, action_type, window_start)
    DO UPDATE SET count = count + 1
  `);

  stmt.run(did, actionType, windowStart);
}

/**
 * Clean old rate limit records.
 * Call this periodically for database maintenance.
 * Removes records older than 2 windows (2 hours).
 *
 * @returns Number of records deleted
 */
export function cleanOldRecords(): number {
  const db = getDatabase();
  const cutoff = now() - (2 * WINDOW_SECONDS);

  const stmt = db.prepare(`
    DELETE FROM rate_limits
    WHERE window_start < ?
  `);

  const result = stmt.run(cutoff);
  return result.changes;
}
