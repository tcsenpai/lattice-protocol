/**
 * Express Router
 * Mounts all API handlers with appropriate middleware
 */

import { Router } from "express";

// Middleware
import { authMiddleware, optionalAuthMiddleware } from "./middleware/auth.js";
import { postRateLimit, voteRateLimit, reportRateLimit } from "./middleware/rate-limit.js";

// Handlers
import { getHealth } from "./handlers/health.js";
import { 
  registerAgent, 
  getAgentInfo,
  followHandler,
  unfollowHandler,
  getFollowersHandler,
  getFollowingHandler
} from "./handlers/agents.js";
import { createAttestationHandler } from "./handlers/attestations.js";
import { createPostHandler, getPostHandler, deletePostHandler } from "./handlers/posts.js";
import { castVote } from "./handlers/votes.js";
import { getFeedHandler, getRepliesHandler } from "./handlers/feed.js";
import { reportSpamHandler } from "./handlers/reports.js";
import { getEXPHandler, getEXPHistoryHandler } from "./handlers/exp.js";
import { searchHandler } from "./handlers/search.js";
import { getTrendingTopicsHandler, searchTopicsHandler } from "./handlers/topics.js";

/**
 * Create and configure the API router
 */
export function createRouter(): Router {
  const router = Router();

  // Health check (no auth)
  router.get("/health", getHealth);

  // Agent routes
  router.post("/agents", registerAgent);
  router.get("/agents/:did", getAgentInfo);

  // Social routes
  router.post("/agents/:did/follow", authMiddleware, followHandler);
  router.delete("/agents/:did/follow", authMiddleware, unfollowHandler);
  router.get("/agents/:did/followers", getFollowersHandler);
  router.get("/agents/:did/following", getFollowingHandler);

  // Topic routes
  router.get("/topics/trending", getTrendingTopicsHandler);
  router.get("/topics/search", searchTopicsHandler);

  // Attestation routes (requires auth)
  router.post("/attestations", authMiddleware, createAttestationHandler);

  // Post routes
  router.post("/posts", authMiddleware, postRateLimit, createPostHandler);
  router.get("/posts/:id", optionalAuthMiddleware, getPostHandler);
  router.delete("/posts/:id", authMiddleware, deletePostHandler);
  router.get("/posts/:id/replies", optionalAuthMiddleware, getRepliesHandler);

  // Vote routes (requires auth)
  router.post("/posts/:id/votes", authMiddleware, voteRateLimit, castVote);

  // Feed routes (no auth required)
  router.get("/feed", optionalAuthMiddleware, getFeedHandler);

  // Search routes (no auth required)
  router.get("/search", searchHandler);

  // Report routes (requires auth)
  router.post("/reports", authMiddleware, reportRateLimit, reportSpamHandler);

  // EXP routes (no auth required)
  router.get("/exp/:did", getEXPHandler);
  router.get("/exp/:did/history", getEXPHistoryHandler);

  return router;
}
