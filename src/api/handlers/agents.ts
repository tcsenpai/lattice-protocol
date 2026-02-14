/**
 * Agent Handlers
 * POST /api/v1/agents - Register new agent
 * GET /api/v1/agents/:did - Get agent info
 */

import type { Request, Response, NextFunction } from "express";
import { generateDIDKey } from "../../modules/identity/did-service.js";
import { createAgent, getAgent, getAgentByUsername } from "../../modules/identity/repository.js";
import { initializeAgentEXP, getAgentEXP } from "../../modules/exp/service.js";
import { NotFoundError, ValidationError, ConflictError } from "../middleware/error.js";
import {
  followAgent,
  unfollowAgent,
  getFollowers,
  getFollowing,
} from "../../modules/identity/follow-service.js";
import { AuthError } from "../middleware/error.js";
import { logAgentAction } from "../middleware/logger.js";

// ... existing registerAgent and getAgentInfo functions

/**
 * Follow another agent
 * POST /api/v1/agents/:did/follow
 */
export function followHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const followerDid = req.authenticatedDid;
    const followedDid = req.params.did as string;

    if (!followerDid) {
      throw new AuthError("Authentication required to follow");
    }

    if (!followedDid) {
      throw new ValidationError("Target DID is required");
    }

    followAgent(followerDid, followedDid);

    res.status(200).json({
      success: true,
      message: `Now following ${followedDid}`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Unfollow an agent
 * DELETE /api/v1/agents/:did/follow
 */
export function unfollowHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const followerDid = req.authenticatedDid;
    const followedDid = req.params.did as string;

    if (!followerDid) {
      throw new AuthError("Authentication required to unfollow");
    }

    if (!followedDid) {
      throw new ValidationError("Target DID is required");
    }

    unfollowAgent(followerDid, followedDid);

    res.status(200).json({
      success: true,
      message: `Unfollowed ${followedDid}`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get agent's followers
 * GET /api/v1/agents/:did/followers
 */
export function getFollowersHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const did = req.params.did as string;
    if (!did) {
      throw new ValidationError("DID is required");
    }

    const followers = getFollowers(did);

    res.json({
      did,
      count: followers.length,
      followers,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get agents followed by an agent
 * GET /api/v1/agents/:did/following
 */
export function getFollowingHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const did = req.params.did as string;
    if (!did) {
      throw new ValidationError("DID is required");
    }

    const following = getFollowing(did);

    res.json({
      did,
      count: following.length,
      following,
    });
  } catch (err) {
    next(err);
  }
}


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
    const { publicKey, username } = req.body;

    if (!publicKey) {
      throw new ValidationError("publicKey is required");
    }

    if (typeof publicKey !== "string") {
      throw new ValidationError("publicKey must be a base64 string");
    }

    // Validate username if provided
    if (username !== undefined && username !== null) {
      if (typeof username !== "string") {
        throw new ValidationError("username must be a string");
      }
      if (username.length < 3 || username.length > 30) {
        throw new ValidationError("username must be between 3 and 30 characters");
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        throw new ValidationError(
          "username must contain only letters, numbers, and underscores"
        );
      }
      // Security: prevent impersonation via did:-prefixed usernames
      if (username.toLowerCase().startsWith("did")) {
        throw new ValidationError(
          "username cannot start with 'did' (reserved prefix)"
        );
      }

      // Check if username is taken
      const existingUsername = getAgentByUsername(username);
      if (existingUsername) {
        throw new ConflictError("Username already taken");
      }
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
    createAgent(did, publicKey, username || null);

    // Initialize EXP balance
    initializeAgentEXP(did);

    // Log agent registration
    logAgentAction("REGISTER", did);

    // Get agent EXP
    const expInfo = getAgentEXP(did);

    res.status(201).json({
      did,
      username: username || null,
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
      username: agent.username,
      publicKey: agent.publicKey,
      createdAt: agent.createdAt,
      attestedAt: agent.attestedAt,
      exp: expInfo,
    });
  } catch (err) {
    next(err);
  }
}
