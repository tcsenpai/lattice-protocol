/**
 * Agent Repository
 * Database operations for agent identity management
 */

import { getDatabase } from '../../db/index.js';
import { now } from '../../utils/time.js';
import type { Agent } from '../../types/index.js';

/**
 * Create a new agent record
 * @param did - The agent's decentralized identifier
 * @param publicKey - The agent's Ed25519 public key (base64 encoded)
 * @param username - Optional username
 * @returns The created Agent object
 */
export function createAgent(did: string, publicKey: string, username: string | null = null): Agent {
  const db = getDatabase();
  const createdAt = now();

  const stmt = db.prepare(`
    INSERT INTO agents (did, username, public_key, created_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(did, username, publicKey, createdAt);

  return {
    did,
    username,
    publicKey,
    createdAt,
    attestedBy: null,
    attestedAt: null,
  };
}

/**
 * Get an agent by their DID
 * @param did - The agent's decentralized identifier
 * @returns The Agent object or null if not found
 */
export function getAgent(did: string): Agent | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT did, username, bio, metadata, public_key, created_at, attested_by, attested_at
    FROM agents
    WHERE did = ?
  `);

  const row = stmt.get(did) as
    | {
        did: string;
        username: string | null;
        bio: string | null;
        metadata: string | null;
        public_key: string;
        created_at: number;
        attested_by: string | null;
        attested_at: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    did: row.did,
    username: row.username,
    bio: row.bio,
    metadata: row.metadata,
    publicKey: row.public_key,
    createdAt: row.created_at,
    attestedBy: row.attested_by,
    attestedAt: row.attested_at,
  };
}

/**
 * Get an agent by their username
 * @param username - The agent's username
 * @returns The Agent object or null if not found
 */
export function getAgentByUsername(username: string): Agent | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT did, username, bio, metadata, public_key, created_at, attested_by, attested_at
    FROM agents
    WHERE username = ?
  `);

  const row = stmt.get(username) as
    | {
        did: string;
        username: string | null;
        bio: string | null;
        metadata: string | null;
        public_key: string;
        created_at: number;
        attested_by: string | null;
        attested_at: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    did: row.did,
    username: row.username,
    bio: row.bio,
    metadata: row.metadata,
    publicKey: row.public_key,
    createdAt: row.created_at,
    attestedBy: row.attested_by,
    attestedAt: row.attested_at,
  };
}

/**
 * Check if an agent exists by their DID
 * @param did - The agent's decentralized identifier
 * @returns true if agent exists, false otherwise
 */
export function agentExists(did: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare('SELECT 1 FROM agents WHERE did = ?');
  const row = stmt.get(did);

  return row !== undefined;
}

/**
 * Update an agent's attestation status
 * Called by the attestation service when an agent is attested
 * @param agentDid - The DID of the agent being attested
 * @param attestorDid - The DID of the attesting agent
 */
export function setAgentAttestation(
  agentDid: string,
  attestorDid: string
): void {
  const db = getDatabase();
  const attestedAt = now();

  const stmt = db.prepare(`
    UPDATE agents
    SET attested_by = ?, attested_at = ?
    WHERE did = ?
  `);

  stmt.run(attestorDid, attestedAt, agentDid);
}

/**
 * Update an agent's profile (bio and/or metadata)
 * @param did - The agent's DID
 * @param updates - Object with bio and/or metadata fields
 */
export function updateAgentProfile(
  did: string,
  updates: { bio?: string; metadata?: string }
): void {
  const db = getDatabase();
  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (updates.bio !== undefined) {
    fields.push('bio = ?');
    values.push(updates.bio || null);
  }

  if (updates.metadata !== undefined) {
    fields.push('metadata = ?');
    values.push(updates.metadata || null);
  }

  if (fields.length === 0) {
    return; // Nothing to update
  }

  values.push(did);

  const stmt = db.prepare(`
    UPDATE agents
    SET ${fields.join(', ')}
    WHERE did = ?
  `);

  stmt.run(...values);
}

/**
 * Search agents by username (fuzzy matching)
 * @param query - Search query
 * @param limit - Maximum number of results
 * @returns Array of matching agents
 */
export function searchAgents(query: string, limit: number = 20): Agent[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT did, username, public_key, bio, metadata, created_at, attested_by, attested_at
    FROM agents
    WHERE username IS NOT NULL
    AND username LIKE ?
    ORDER BY
      CASE
        WHEN username = ? THEN 0
        WHEN username LIKE ? THEN 1
        ELSE 2
      END,
      attested_at DESC NULLS LAST,
      created_at DESC
    LIMIT ?
  `);

  const searchPattern = `%${query}%`;
  const exactMatch = query;
  const prefixMatch = `${query}%`;

  const rows = stmt.all(searchPattern, exactMatch, prefixMatch, limit) as Array<{
    did: string;
    username: string | null;
    public_key: string;
    bio: string | null;
    metadata: string | null;
    created_at: number;
    attested_by: string | null;
    attested_at: number | null;
  }>;

  return rows.map(row => ({
    did: row.did,
    username: row.username,
    publicKey: row.public_key,
    bio: row.bio,
    metadata: row.metadata,
    createdAt: row.created_at,
    attestedBy: row.attested_by,
    attestedAt: row.attested_at,
  }));
}
