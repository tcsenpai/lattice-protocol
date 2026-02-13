/**
 * EXP Repository
 * Data access layer for EXP balances and history
 */

import { getDatabase } from '../../db/index.js';
import { generateId } from '../../utils/ulid.js';
import { now } from '../../utils/time.js';
import type { EXPDelta, EXPReason } from '../../types/index.js';

/**
 * Initialize EXP balance for a new agent with 0 EXP
 * @param did - The agent's DID
 */
export function createBalance(did: string): void {
  const db = getDatabase();
  const updatedAt = now();

  const stmt = db.prepare(`
    INSERT INTO exp_balances (did, total, post_karma, comment_karma, updated_at)
    VALUES (?, 0, 0, 0, ?)
  `);

  stmt.run(did, updatedAt);
}

/**
 * Get current EXP balance for an agent
 * @param did - The agent's DID
 * @returns Balance object or null if agent not found
 */
export function getBalance(did: string): {
  total: number;
  postKarma: number;
  commentKarma: number;
} | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT total, post_karma, comment_karma
    FROM exp_balances
    WHERE did = ?
  `);

  const row = stmt.get(did) as {
    total: number;
    post_karma: number;
    comment_karma: number;
  } | undefined;

  if (!row) return null;

  return {
    total: row.total,
    postKarma: row.post_karma,
    commentKarma: row.comment_karma
  };
}

/**
 * Update balance atomically with history log
 * Uses a transaction to ensure both operations succeed or fail together
 *
 * @param did - The agent's DID
 * @param delta - The amount to add (can be negative)
 * @param reason - The reason for the change
 * @param sourceId - Optional source ID (e.g., post ID for karma)
 */
export function updateBalance(
  did: string,
  delta: number,
  reason: EXPReason,
  sourceId: string | null = null
): void {
  const db = getDatabase();
  const timestamp = now();
  const deltaId = generateId();

  // Prepare statements
  const updateStmt = db.prepare(`
    UPDATE exp_balances
    SET total = total + ?,
        updated_at = ?
    WHERE did = ?
  `);

  const logStmt = db.prepare(`
    INSERT INTO exp_deltas (id, agent_did, amount, reason, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Execute atomically in a transaction
  db.transaction(() => {
    updateStmt.run(delta, timestamp, did);
    logStmt.run(deltaId, did, delta, reason, sourceId, timestamp);
  })();
}

/**
 * Get paginated EXP history for an agent using ULID cursor
 * Results are ordered by ID descending (newest first)
 *
 * @param did - The agent's DID
 * @param cursor - Optional ULID cursor for pagination (exclusive)
 * @param limit - Maximum number of results to return
 * @returns Object containing deltas array and next cursor
 */
export function getHistory(
  did: string,
  cursor: string | null,
  limit: number
): { deltas: EXPDelta[]; nextCursor: string | null } {
  const db = getDatabase();

  let stmt;
  let params: (string | number)[];

  if (cursor) {
    // Fetch records with ID less than cursor (older entries)
    stmt = db.prepare(`
      SELECT id, agent_did, amount, reason, source_id, created_at
      FROM exp_deltas
      WHERE agent_did = ?
      AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `);
    params = [did, cursor, limit + 1];
  } else {
    // Fetch from the beginning (newest entries)
    stmt = db.prepare(`
      SELECT id, agent_did, amount, reason, source_id, created_at
      FROM exp_deltas
      WHERE agent_did = ?
      ORDER BY id DESC
      LIMIT ?
    `);
    params = [did, limit + 1];
  }

  const rows = stmt.all(...params) as Array<{
    id: string;
    agent_did: string;
    amount: number;
    reason: string;
    source_id: string | null;
    created_at: number;
  }>;

  // Check if there are more results
  const hasMore = rows.length > limit;

  // Map rows to EXPDelta objects, excluding the extra record used for hasMore check
  const deltas = rows.slice(0, limit).map(row => ({
    id: row.id,
    agentDid: row.agent_did,
    amount: row.amount,
    reason: row.reason as EXPReason,
    sourceId: row.source_id,
    createdAt: row.created_at
  }));

  // Set next cursor to the last item's ID if there are more results
  const nextCursor = hasMore ? deltas[deltas.length - 1]?.id ?? null : null;

  return { deltas, nextCursor };
}
