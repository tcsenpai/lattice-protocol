/**
 * Vote Handlers
 * POST /api/v1/posts/:id/votes - Cast a vote
 */

import type { Request, Response, NextFunction } from "express";
import { vote, getVoteCounts } from "../../modules/content/vote-service.js";
import { getPost } from "../../modules/content/repository.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../middleware/error.js";

/**
 * Cast a vote on a post
 * POST /api/v1/posts/:id/votes
 *
 * Body:
 * - value: 1 for upvote, -1 for downvote
 */
export function castVote(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const voterDid = req.authenticatedDid;
    if (!voterDid) {
      throw new ForbiddenError("Authentication required to vote");
    }

    const postId = req.params.id as string;
    const { value } = req.body;

    if (!postId) {
      throw new ValidationError("Post ID is required");
    }

    if (value !== 1 && value !== -1) {
      throw new ValidationError("value must be 1 (upvote) or -1 (downvote)");
    }

    // Check post exists
    const post = getPost(postId);
    if (!post) {
      throw new NotFoundError("Post", postId);
    }

    // Check not deleted
    if (post.deleted) {
      throw new ValidationError("Cannot vote on a deleted post");
    }

    const signature = req.headers["x-signature"] as string;

    try {
      const result = vote(postId, voterDid, value, signature);
      const counts = getVoteCounts(postId);

      res.json({
        vote: result.vote,
        expAffected: result.expAffected,
        postVotes: counts,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Cannot vote on your own post") {
        throw new ForbiddenError(err.message);
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
