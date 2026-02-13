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
 * @returns The created Agent object
 */
export function createAgent(did: string, publicKey: string): Agent {
  const db = getDatabase();
  const createdAt = now();

  const stmt = db.prepare(`
    INSERT INTO agents (did, public_key, created_at)
    VALUES (?, ?, ?)
  `);

  stmt.run(did, publicKey, createdAt);

  return {
    did,
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
    SELECT did, public_key, created_at, attested_by, attested_at
    FROM agents
    WHERE did = ?
  `);

  const row = stmt.get(did) as
    | {
        did: string;
        public_key: string;
        created_at: number;
        attested_by: string | null;
        attested_at: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    did: row.did,
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
