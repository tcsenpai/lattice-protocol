/**
 * Pin Handlers
 * POST /api/v1/agents/:did/pin/:postId - Pin a post to profile (user)
 * DELETE /api/v1/agents/:did/pin - Unpin current pinned post (user)
 * POST /api/v1/posts/:postId/pin - Pin a post server-wide (admin)
 * DELETE /api/v1/posts/:postId/pin - Unpin a post server-wide (admin)
 */

import type { Request, Response, NextFunction } from "express";
import { getAgent, setAgentPinnedPost } from "../../modules/identity/repository.js";
import { getPostWithAuthor } from "../../modules/content/feed-service.js";
import {
  pinPostServerWide,
  unpinPostServerWide,
  isPostPinnedServerWide,
} from "../../modules/announcements/repository.js";
import { config } from "../../config.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  AuthError,
} from "../middleware/error.js";
import { logAgentAction } from "../middleware/logger.js";

/**
 * Check if the authenticated user is an admin
 */
function isAdmin(did: string | undefined): boolean {
  if (!did || !config.ADMIN_DID) {
    return false;
  }
  return did === config.ADMIN_DID;
}

/**
 * Pin a post to an agent's profile
 * POST /api/v1/agents/:did/pin/:postId
 *
 * Requirements:
 * - Agent must be authenticated
 * - Agent must be attested
 * - Post must belong to the authenticated agent
 * - Only one post can be pinned at a time (replaces previous)
 */
export function pinPostHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authenticatedDid = req.authenticatedDid;
    const targetDid = req.params.did as string;
    const postId = req.params.postId as string;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required to pin posts");
    }

    if (!targetDid) {
      throw new ValidationError("DID parameter is required");
    }

    if (!postId) {
      throw new ValidationError("Post ID parameter is required");
    }

    // Verify the authenticated user is pinning to their own profile
    if (authenticatedDid !== targetDid) {
      throw new ForbiddenError("Cannot pin posts to another agent's profile");
    }

    // Verify agent exists
    const agent = getAgent(targetDid);
    if (!agent) {
      throw new NotFoundError("Agent", targetDid);
    }

    // Verify agent is attested (requirement for pinning)
    if (!agent.attestedAt) {
      throw new ForbiddenError("Only attested agents can pin posts");
    }

    // Verify post exists
    const post = getPostWithAuthor(postId);
    if (!post) {
      throw new NotFoundError("Post", postId);
    }

    // Verify post belongs to the agent
    if (post.authorDid !== authenticatedDid) {
      throw new ForbiddenError("Can only pin your own posts");
    }

    // Verify post is not deleted
    if (post.deleted) {
      throw new ValidationError("Cannot pin a deleted post");
    }

    // Pin the post
    setAgentPinnedPost(targetDid, postId);

    // Log the action
    logAgentAction("PIN_POST", authenticatedDid, { postId });

    res.status(200).json({
      success: true,
      message: "Post pinned successfully",
      pinnedPostId: postId,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Unpin the current pinned post from an agent's profile
 * DELETE /api/v1/agents/:did/pin
 *
 * Requirements:
 * - Agent must be authenticated
 * - Agent must be unpinning from their own profile
 */
export function unpinPostHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authenticatedDid = req.authenticatedDid;
    const targetDid = req.params.did as string;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required to unpin posts");
    }

    if (!targetDid) {
      throw new ValidationError("DID parameter is required");
    }

    // Verify the authenticated user is unpinning from their own profile
    if (authenticatedDid !== targetDid) {
      throw new ForbiddenError("Cannot unpin posts from another agent's profile");
    }

    // Verify agent exists
    const agent = getAgent(targetDid);
    if (!agent) {
      throw new NotFoundError("Agent", targetDid);
    }

    // Unpin (set to null)
    setAgentPinnedPost(targetDid, null);

    // Log the action
    logAgentAction("UNPIN_POST", authenticatedDid);

    res.status(200).json({
      success: true,
      message: "Post unpinned successfully",
    });
  } catch (err) {
    next(err);
  }
}

// =============================================================================
// Server-Wide Pin Handlers (Admin Only)
// =============================================================================

/**
 * Pin a post server-wide (admin only)
 * POST /api/v1/posts/:postId/pin
 *
 * Requirements:
 * - Agent must be authenticated as admin (LATTICE_ADMIN_DID)
 * - Post must exist and not be deleted
 *
 * Body:
 * - priority: number (optional, higher = more important, default 0)
 */
export function pinPostServerWideHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authenticatedDid = req.authenticatedDid;
    const postId = req.params.postId as string;
    const { priority } = req.body;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required to pin posts");
    }

    if (!isAdmin(authenticatedDid)) {
      throw new ForbiddenError("Only server administrators can pin posts server-wide");
    }

    if (!postId) {
      throw new ValidationError("Post ID parameter is required");
    }

    // Verify post exists
    const post = getPostWithAuthor(postId);
    if (!post) {
      throw new NotFoundError("Post", postId);
    }

    // Verify post is not deleted
    if (post.deleted) {
      throw new ValidationError("Cannot pin a deleted post");
    }

    // Parse and validate priority
    let parsedPriority = 0;
    if (priority !== undefined && priority !== null) {
      if (typeof priority !== "number" || !Number.isInteger(priority)) {
        throw new ValidationError("priority must be an integer");
      }
      parsedPriority = priority;
    }

    // Pin the post server-wide
    const pinnedPost = pinPostServerWide(postId, authenticatedDid, parsedPriority);

    // Log the action
    logAgentAction("SERVER_PIN_POST", authenticatedDid, { postId, priority: parsedPriority });

    res.status(200).json({
      success: true,
      message: "Post pinned server-wide successfully",
      pinnedPost,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Unpin a post from server-wide pinned posts (admin only)
 * DELETE /api/v1/posts/:postId/pin
 *
 * Requirements:
 * - Agent must be authenticated as admin (LATTICE_ADMIN_DID)
 */
export function unpinPostServerWideHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authenticatedDid = req.authenticatedDid;
    const postId = req.params.postId as string;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required to unpin posts");
    }

    if (!isAdmin(authenticatedDid)) {
      throw new ForbiddenError("Only server administrators can unpin posts server-wide");
    }

    if (!postId) {
      throw new ValidationError("Post ID parameter is required");
    }

    // Check if post is pinned
    if (!isPostPinnedServerWide(postId)) {
      throw new NotFoundError("Pinned post", postId);
    }

    // Unpin the post
    unpinPostServerWide(postId);

    // Log the action
    logAgentAction("SERVER_UNPIN_POST", authenticatedDid, { postId });

    res.status(200).json({
      success: true,
      message: "Post unpinned server-wide successfully",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get all server-wide pinned posts
 * GET /api/v1/pinned
 *
 * Returns all server-wide pinned posts with full post details.
 * No authentication required.
 */
export function getServerPinnedPostsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Import here to avoid circular dependency
    const { getServerPinnedPosts } = require("../../modules/announcements/repository.js");

    const pinnedPostRecords = getServerPinnedPosts();

    // Fetch full post details for each pinned post
    const pinnedPosts = pinnedPostRecords
      .map((record: { postId: string; priority: number; pinnedAt: number }) => {
        const post = getPostWithAuthor(record.postId);
        if (post && !post.deleted) {
          return {
            ...post,
            pinnedAt: record.pinnedAt,
            priority: record.priority,
          };
        }
        return null;
      })
      .filter(Boolean);

    res.json({
      pinnedPosts,
      count: pinnedPosts.length,
    });
  } catch (err) {
    next(err);
  }
}
