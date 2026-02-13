/**
 * Post Handlers
 * POST /api/v1/posts - Create post
 * GET /api/v1/posts/:id - Get post
 * DELETE /api/v1/posts/:id - Delete post
 */

import type { Request, Response, NextFunction } from "express";
import { createPostWithSpamCheck, deletePost } from "../../modules/content/service.js";
import { getPostWithAuthor } from "../../modules/content/feed-service.js";
import { getVoteCounts } from "../../modules/content/vote-service.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../middleware/error.js";

/**
 * Maximum content length (50KB)
 */
const MAX_CONTENT_LENGTH = 50 * 1024;

/**
 * Create a new post
 * POST /api/v1/posts
 *
 * Body:
 * - content: Post content (required)
 * - parentId: Parent post ID for replies (optional)
 */
export function createPostHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authorDid = req.authenticatedDid;
    if (!authorDid) {
      throw new ForbiddenError("Authentication required to create posts");
    }

    const { content, parentId } = req.body;

    if (!content) {
      throw new ValidationError("content is required");
    }

    if (typeof content !== "string") {
      throw new ValidationError("content must be a string");
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`content exceeds maximum length of ${MAX_CONTENT_LENGTH} bytes`);
    }

    if (content.trim().length === 0) {
      throw new ValidationError("content cannot be empty");
    }

    if (parentId !== undefined && typeof parentId !== "string") {
      throw new ValidationError("parentId must be a string");
    }

    const signature = req.headers["x-signature"] as string;
    const timestamp = parseInt(req.headers["x-timestamp"] as string, 10);

    const result = createPostWithSpamCheck({
      content,
      contentType: "TEXT",
      parentId: parentId || null,
      authorDid,
      signature,
      timestamp,
    });

    if (!result.post) {
      // Rate limited or spam rejected
      res.status(429).json({
        error: {
          code: result.spamResult.isSpam ? "SPAM_DETECTED" : "RATE_LIMITED",
          message: result.spamResult.isSpam
            ? `Content rejected: ${result.spamResult.reason}`
            : "Rate limit exceeded",
        },
      });
      return;
    }

    res.status(201).json({
      id: result.post.id,
      content: result.post.content,
      contentType: result.post.contentType,
      parentId: result.post.parentId,
      authorDid: result.post.authorDid,
      createdAt: result.post.createdAt,
      spamStatus: result.spamResult.action,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get a post by ID
 * GET /api/v1/posts/:id
 */
export function getPostHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const id = req.params.id as string;

    if (!id) {
      throw new ValidationError("id parameter is required");
    }

    const post = getPostWithAuthor(id);
    if (!post) {
      throw new NotFoundError("Post", id);
    }

    const votes = getVoteCounts(id);

    res.json({
      ...post,
      upvotes: votes.upvotes,
      downvotes: votes.downvotes,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Delete a post
 * DELETE /api/v1/posts/:id
 *
 * Only the author can delete their own posts
 */
export function deletePostHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authorDid = req.authenticatedDid;
    if (!authorDid) {
      throw new ForbiddenError("Authentication required to delete posts");
    }

    const id = req.params.id as string;

    if (!id) {
      throw new ValidationError("id parameter is required");
    }

    const post = getPostWithAuthor(id);
    if (!post) {
      throw new NotFoundError("Post", id);
    }

    if (post.authorDid !== authorDid) {
      throw new ForbiddenError("Cannot delete another user's post");
    }

    if (post.deleted) {
      throw new ValidationError("Post is already deleted");
    }

    deletePost(id, authorDid);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
