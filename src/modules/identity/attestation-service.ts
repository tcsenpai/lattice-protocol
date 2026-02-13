/**
 * Attestation Service
 * Handles human attestation of AI agents with rate limiting
 */

import { getDatabase } from '../../db/index.js';
import { generateId } from '../../utils/ulid.js';
import { now } from '../../utils/time.js';
import { setAgentAttestation } from './repository.js';
import type { Attestation } from '../../types/index.js';

/**
 * Maximum number of attestations a human can give per window
 */
const MAX_ATTESTATIONS_PER_WINDOW = 5;

/**
 * Time window for attestation rate limiting (in days)
 */
const ATTESTATION_WINDOW_DAYS = 30;

/**
 * Create an attestation record and update the agent's status
 * @param agentDid - The DID of the agent being attested
 * @param attestorDid - The DID of the human attesting
 * @param signature - The attestor's cryptographic signature
 * @returns The created Attestation object
 * @throws Error if attestor has reached limit or agent already attested
 */
export function createAttestation(
  agentDid: string,
  attestorDid: string,
  signature: string
): Attestation {
  const db = getDatabase();

  // Check attestor's limit in time window
  const count = getAttestationCount(attestorDid, ATTESTATION_WINDOW_DAYS);
  if (count >= MAX_ATTESTATIONS_PER_WINDOW) {
    throw new Error(
      `Attestor has reached limit of ${MAX_ATTESTATIONS_PER_WINDOW} attestations per ${ATTESTATION_WINDOW_DAYS} days`
    );
  }

  // Check if agent already has attestation
  if (hasAttestation(agentDid)) {
    throw new Error('Agent already has an attestation');
  }

  const id = generateId();
  const createdAt = now();

  // Insert attestation record
  const stmt = db.prepare(`
    INSERT INTO attestations (id, agent_did, attestor_did, signature, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, agentDid, attestorDid, signature, createdAt);

  // Update agent's attestation status
  setAgentAttestation(agentDid, attestorDid);

  return {
    id,
    agentDid,
    attestorDid,
    signature,
    createdAt,
  };
}

/**
 * Count attestations made by an attestor within a time window
 * @param attestorDid - The DID of the attestor
 * @param windowDays - The time window in days
 * @returns The number of attestations in the window
 */
export function getAttestationCount(
  attestorDid: string,
  windowDays: number
): number {
  const db = getDatabase();
  const windowStart = now() - windowDays * 24 * 60 * 60;

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM attestations
    WHERE attestor_did = ?
    AND created_at >= ?
  `);

  const row = stmt.get(attestorDid, windowStart) as { count: number };
  return row.count;
}

/**
 * Check if an agent has been attested by a human
 * @param agentDid - The DID of the agent to check
 * @returns true if agent has attestation, false otherwise
 */
export function hasAttestation(agentDid: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT 1 FROM agents
    WHERE did = ?
    AND attested_by IS NOT NULL
  `);

  const row = stmt.get(agentDid);
  return row !== undefined;
}

/**
 * Get the attestation record for an agent
 * @param agentDid - The DID of the agent
 * @returns The Attestation object or null if not found
 */
export function getAttestation(agentDid: string): Attestation | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT id, agent_did, attestor_did, signature, created_at
    FROM attestations
    WHERE agent_did = ?
  `);

  const row = stmt.get(agentDid) as
    | {
        id: string;
        agent_did: string;
        attestor_did: string;
        signature: string;
        created_at: number;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    agentDid: row.agent_did,
    attestorDid: row.attestor_did,
    signature: row.signature,
    createdAt: row.created_at,
  };
}
