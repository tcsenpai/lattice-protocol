/**
 * Announcement Handlers
 * GET /api/v1/announcements - Get active announcements
 * POST /api/v1/announcements - Create announcement (admin only)
 * DELETE /api/v1/announcements/:id - Deactivate announcement (admin only)
 */

import type { Request, Response, NextFunction } from "express";
import {
  createAnnouncement,
  getActiveAnnouncements,
  deactivateAnnouncement,
} from "../../modules/announcements/repository.js";
import { config } from "../../config.js";
import {
  ValidationError,
  ForbiddenError,
  AuthError,
  NotFoundError,
} from "../middleware/error.js";
import { logAgentAction } from "../middleware/logger.js";

/**
 * Maximum announcement content length
 */
const MAX_ANNOUNCEMENT_LENGTH = 2000;

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
 * Get active announcements
 * GET /api/v1/announcements
 *
 * Returns all active, non-expired announcements sorted by creation date (newest first)
 * No authentication required.
 */
export function getAnnouncementsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const announcements = getActiveAnnouncements();

    res.json({
      announcements,
      count: announcements.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new announcement
 * POST /api/v1/announcements
 *
 * Body:
 * - content: string (required, max 2000 chars)
 * - expiresAt: number (optional, Unix timestamp in seconds)
 *
 * Requirements:
 * - Authenticated as admin (LATTICE_ADMIN_DID)
 */
export function createAnnouncementHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authenticatedDid = req.authenticatedDid;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required to create announcements");
    }

    if (!isAdmin(authenticatedDid)) {
      throw new ForbiddenError("Only server administrators can create announcements");
    }

    const { content, expiresAt } = req.body;

    // Validate content
    if (!content) {
      throw new ValidationError("content is required");
    }

    if (typeof content !== "string") {
      throw new ValidationError("content must be a string");
    }

    if (content.trim().length === 0) {
      throw new ValidationError("content cannot be empty");
    }

    if (content.length > MAX_ANNOUNCEMENT_LENGTH) {
      throw new ValidationError(
        `content exceeds maximum length of ${MAX_ANNOUNCEMENT_LENGTH} characters`
      );
    }

    // Validate expiresAt
    let parsedExpiresAt: number | null = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      if (typeof expiresAt !== "number") {
        throw new ValidationError("expiresAt must be a number (Unix timestamp in seconds)");
      }

      // Convert to seconds if given in milliseconds
      parsedExpiresAt = expiresAt > 9999999999 ? Math.floor(expiresAt / 1000) : expiresAt;

      // Validate expiration is in the future
      const now = Math.floor(Date.now() / 1000);
      if (parsedExpiresAt <= now) {
        throw new ValidationError("expiresAt must be in the future");
      }
    }

    const announcement = createAnnouncement(content.trim(), authenticatedDid, parsedExpiresAt);

    // Log the action
    logAgentAction("CREATE_ANNOUNCEMENT", authenticatedDid, { announcementId: announcement.id });

    res.status(201).json(announcement);
  } catch (err) {
    next(err);
  }
}

/**
 * Deactivate an announcement
 * DELETE /api/v1/announcements/:id
 *
 * Requirements:
 * - Authenticated as admin (LATTICE_ADMIN_DID)
 */
export function deleteAnnouncementHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authenticatedDid = req.authenticatedDid;
    const announcementId = req.params.id as string;

    if (!authenticatedDid) {
      throw new AuthError("Authentication required to delete announcements");
    }

    if (!isAdmin(authenticatedDid)) {
      throw new ForbiddenError("Only server administrators can delete announcements");
    }

    if (!announcementId) {
      throw new ValidationError("Announcement ID is required");
    }

    const success = deactivateAnnouncement(announcementId);

    if (!success) {
      throw new NotFoundError("Announcement", announcementId);
    }

    // Log the action
    logAgentAction("DELETE_ANNOUNCEMENT", authenticatedDid, { announcementId });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
