/**
 * Report Handlers
 * POST /api/v1/reports - Report spam
 */

import type { Request, Response, NextFunction } from "express";
import { reportSpam } from "../../modules/spam/service.js";
import { getPost } from "../../modules/content/repository.js";
import { ValidationError, NotFoundError, ForbiddenError } from "../middleware/error.js";

/**
 * Valid spam report reasons
 */
const VALID_REASONS = ["spam", "harassment", "misinformation", "other"] as const;
type ReportReason = typeof VALID_REASONS[number];

/**
 * Report a post as spam
 * POST /api/v1/reports
 *
 * Body:
 * - postId: ID of the post to report
 * - reason: Reason for report (spam, harassment, misinformation, other)
 */
export function reportSpamHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const reporterDid = req.authenticatedDid;
    if (!reporterDid) {
      throw new ForbiddenError("Authentication required to report spam");
    }

    const { postId, reason } = req.body;

    if (!postId) {
      throw new ValidationError("postId is required");
    }

    if (typeof postId !== "string") {
      throw new ValidationError("postId must be a string");
    }

    if (!reason) {
      throw new ValidationError("reason is required");
    }

    if (!VALID_REASONS.includes(reason as ReportReason)) {
      throw new ValidationError(
        `reason must be one of: ${VALID_REASONS.join(", ")}`
      );
    }

    // Check post exists
    const post = getPost(postId);
    if (!post) {
      throw new NotFoundError("Post", postId);
    }

    // Cannot report your own post
    if (post.authorDid === reporterDid) {
      throw new ForbiddenError("Cannot report your own post");
    }

    // Create report
    const report = reportSpam(postId, reporterDid, reason);

    res.status(201).json({
      id: report.id,
      postId: report.postId,
      reason: report.reason,
      createdAt: report.createdAt,
      message: "Report submitted successfully",
    });
  } catch (err) {
    // Handle duplicate report error
    if (err instanceof Error && err.message.includes("already reported")) {
      next(new ValidationError("You have already reported this post"));
      return;
    }
    next(err);
  }
}
