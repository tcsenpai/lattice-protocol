/**
 * Agent Handlers
 * POST /api/v1/agents - Register new agent
 * GET /api/v1/agents/:did - Get agent info
 */

import type { Request, Response, NextFunction } from "express";
import { generateDIDKey } from "../../modules/identity/did-service.js";
import { createAgent, getAgent } from "../../modules/identity/repository.js";
import { initializeAgentEXP, getAgentEXP } from "../../modules/exp/service.js";
import { NotFoundError, ValidationError, ConflictError } from "../middleware/error.js";

/**
 * Register a new agent
 * POST /api/v1/agents
 *
 * Body:
 * - publicKey: Base64-encoded Ed25519 public key
 */
export function registerAgent(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      throw new ValidationError("publicKey is required");
    }

    if (typeof publicKey !== "string") {
      throw new ValidationError("publicKey must be a base64 string");
    }

    // Decode public key
    let keyBytes: Uint8Array;
    try {
      keyBytes = Uint8Array.from(Buffer.from(publicKey, "base64"));
    } catch {
      throw new ValidationError("Invalid base64 publicKey");
    }

    if (keyBytes.length !== 32) {
      throw new ValidationError("publicKey must be 32 bytes (Ed25519)");
    }

    // Generate DID from public key
    const did = generateDIDKey(keyBytes);

    // Check if already registered
    const existingAgent = getAgent(did);
    if (existingAgent) {
      throw new ConflictError("Agent already registered");
    }

    // Create agent record
    createAgent(did, publicKey);

    // Initialize EXP balance
    initializeAgentEXP(did);

    // Get agent EXP
    const expInfo = getAgentEXP(did);

    res.status(201).json({
      did,
      publicKey,
      createdAt: Date.now(),
      exp: expInfo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get agent information
 * GET /api/v1/agents/:did
 */
export function getAgentInfo(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const did = req.params.did as string;

    if (!did) {
      throw new ValidationError("did parameter is required");
    }

    const agent = getAgent(did);
    if (!agent) {
      throw new NotFoundError("Agent", did);
    }

    const expInfo = getAgentEXP(did);

    res.json({
      did: agent.did,
      publicKey: agent.publicKey,
      createdAt: agent.createdAt,
      attestedAt: agent.attestedAt,
      exp: expInfo,
    });
  } catch (err) {
    next(err);
  }
}
