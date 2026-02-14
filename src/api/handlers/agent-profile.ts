/**
 * Agent Profile Handlers
 * PATCH /api/v1/agents/:did - Update agent profile
 * GET /api/v1/agents/me - Get own profile
 * GET /api/v1/agents?search=query - Search agents
 */

import type { Request, Response, NextFunction } from "express";
import { getAgent, updateAgentProfile, searchAgents } from "../../modules/identity/repository.js";
import { getAgentEXP } from "../../modules/exp/service.js";
import { NotFoundError, ValidationError, AuthError } from "../middleware/error.js";

/**
 * Get authenticated agent's own profile
 * GET /api/v1/agents/me
 */
export function getMeHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const did = req.authenticatedDid;

    if (!did) {
      throw new AuthError("Authentication required");
    }

    const agent = getAgent(did);
    if (!agent) {
      throw new NotFoundError("Agent", did);
    }

    const expInfo = getAgentEXP(did);

    res.json({
      did: agent.did,
      username: agent.username,
      bio: agent.bio,
      metadata: agent.metadata ? JSON.parse(agent.metadata) : null,
      publicKey: agent.publicKey,
      createdAt: agent.createdAt,
      attestedAt: agent.attestedAt,
      exp: expInfo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update agent profile
 * PATCH /api/v1/agents/:did
 */
export function updateProfileHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const targetDid = req.params.did as string;
    const authenticatedDid = req.authenticatedDid;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required");
    }

    // Only allow agents to update their own profile
    if (targetDid !== authenticatedDid) {
      throw new AuthError("You can only update your own profile");
    }

    const { bio, metadata } = req.body;

    // Validate bio
    if (bio !== undefined && bio !== null) {
      if (typeof bio !== "string") {
        throw new ValidationError("bio must be a string");
      }
      if (bio.length > 500) {
        throw new ValidationError("bio must be 500 characters or less");
      }
    }

    // Validate metadata
    if (metadata !== undefined && metadata !== null) {
      if (typeof metadata !== "object") {
        throw new ValidationError("metadata must be an object");
      }
      // Serialize to check size
      const metadataStr = JSON.stringify(metadata);
      if (metadataStr.length > 2000) {
        throw new ValidationError("metadata must be 2000 characters or less when serialized");
      }
    }

    // Update profile
    updateAgentProfile(targetDid, {
      bio: bio !== undefined ? bio : undefined,
      metadata: metadata !== undefined ? JSON.stringify(metadata) : undefined,
    });

    // Get updated agent
    const agent = getAgent(targetDid);
    if (!agent) {
      throw new NotFoundError("Agent", targetDid);
    }

    const expInfo = getAgentEXP(targetDid);

    res.json({
      did: agent.did,
      username: agent.username,
      bio: agent.bio,
      metadata: agent.metadata ? JSON.parse(agent.metadata) : null,
      publicKey: agent.publicKey,
      createdAt: agent.createdAt,
      attestedAt: agent.attestedAt,
      exp: expInfo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Search agents by username
 * GET /api/v1/agents?search=query&limit=20
 */
export function searchAgentsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const query = req.query.search as string;
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    if (!query) {
      throw new ValidationError("search query parameter is required");
    }

    if (query.length < 2) {
      throw new ValidationError("search query must be at least 2 characters");
    }

    if (limit < 1 || limit > 100) {
      throw new ValidationError("limit must be between 1 and 100");
    }

    const agents = searchAgents(query, limit);

    // Enrich with EXP info
    const enrichedAgents = agents.map(agent => {
      const expInfo = getAgentEXP(agent.did);
      return {
        did: agent.did,
        username: agent.username,
        bio: agent.bio,
        createdAt: agent.createdAt,
        attestedAt: agent.attestedAt,
        exp: expInfo,
      };
    });

    res.json({
      query,
      count: enrichedAgents.length,
      agents: enrichedAgents,
    });
  } catch (err) {
    next(err);
  }
}
