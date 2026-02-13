/**
 * Attestation Handlers
 * POST /api/v1/attestations - Create attestation
 */

import type { Request, Response, NextFunction } from "express";
import {
  createAttestation,
  getAttestationCount,
} from "../../modules/identity/attestation-service.js";
import { getAgent } from "../../modules/identity/repository.js";
import { grantAttestationBonus } from "../../modules/exp/service.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../middleware/error.js";
import { logAgentAction } from "../middleware/logger.js";

/**
 * Maximum attestations per attestor per 30 days
 */
const MAX_ATTESTATIONS_PER_WINDOW = 5;

/**
 * Create an attestation for an agent
 * POST /api/v1/attestations
 *
 * Body:
 * - agentDid: DID of the agent being attested
 *
 * Requires authentication (attestor's DID from x-did header)
 */
export function createAttestationHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const attestorDid = req.authenticatedDid;
    const { agentDid } = req.body;

    if (!attestorDid) {
      throw new ForbiddenError("Authentication required to create attestation");
    }

    if (!agentDid) {
      throw new ValidationError("agentDid is required");
    }

    if (typeof agentDid !== "string") {
      throw new ValidationError("agentDid must be a string");
    }

    // Cannot attest yourself
    if (attestorDid === agentDid) {
      throw new ValidationError("Cannot attest yourself");
    }

    // Check agent exists
    const agent = getAgent(agentDid);
    if (!agent) {
      throw new NotFoundError("Agent", agentDid);
    }

    // Check agent isn't already attested
    if (agent.attestedAt) {
      throw new ValidationError("Agent is already attested");
    }

    // Check attestor rate limit (5 per 30 days)
    const recentCount = getAttestationCount(attestorDid, 30);
    if (recentCount >= MAX_ATTESTATIONS_PER_WINDOW) {
      throw new ForbiddenError(
        `Attestation limit reached (${MAX_ATTESTATIONS_PER_WINDOW} per 30 days)`
      );
    }

    // Create attestation
    const signature = req.headers["x-signature"] as string;
    const attestation = createAttestation(agentDid, attestorDid, signature);

    // Grant attestation bonus to agent
    grantAttestationBonus(agentDid);

    // Log attestation
    logAgentAction("ATTEST", attestorDid, { 
      targetDid: agentDid,
      remaining: MAX_ATTESTATIONS_PER_WINDOW - recentCount - 1 
    });

    res.status(201).json({
      id: attestation.id,
      agentDid: attestation.agentDid,
      attestorDid: attestation.attestorDid,
      createdAt: attestation.createdAt,
      remainingAttestations: MAX_ATTESTATIONS_PER_WINDOW - recentCount - 1,
    });
  } catch (err) {
    next(err);
  }
}
