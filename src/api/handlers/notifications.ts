/**
 * Notification Handlers
 * API handlers for notification endpoints
 */

import type { Request, Response, NextFunction } from "express";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} from "../../modules/notifications/index.js";
import { ValidationError, NotFoundError } from "../middleware/error.js";

/**
 * GET /notifications
 * Get paginated notifications for authenticated user
 * Query params: cursor, limit, unreadOnly
 */
export function getNotificationsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const recipientDid = req.authenticatedDid;
    if (!recipientDid) {
      throw new ValidationError("Authentication required");
    }

    const cursor = (req.query.cursor as string) || null;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = getNotifications(recipientDid, cursor, limit, unreadOnly);

    res.json({
      notifications: result.notifications.map(n => ({
        id: n.id,
        type: n.type,
        sourceDid: n.sourceDid,
        sourceUsername: n.sourceUsername,
        sourcePostId: n.sourcePostId,
        targetPostId: n.targetPostId,
        targetPostExcerpt: n.targetPostExcerpt,
        count: n.count,
        read: n.read,
        createdAt: n.createdAt
      })),
      nextCursor: result.nextCursor
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /notifications/unread-count
 * Get unread notification count for polling
 */
export function getUnreadCountHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const recipientDid = req.authenticatedDid;
    if (!recipientDid) {
      throw new ValidationError("Authentication required");
    }

    const count = getUnreadCount(recipientDid);

    res.json({ count });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/:id/read
 * Mark a single notification as read
 */
export function markAsReadHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const recipientDid = req.authenticatedDid;
    if (!recipientDid) {
      throw new ValidationError("Authentication required");
    }

    const id = req.params.id as string;
    if (!id) {
      throw new ValidationError("Notification ID is required");
    }

    const success = markAsRead(id, recipientDid);
    if (!success) {
      throw new NotFoundError("Notification", id);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /notifications/read-all
 * Mark all notifications as read
 */
export function markAllAsReadHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const recipientDid = req.authenticatedDid;
    if (!recipientDid) {
      throw new ValidationError("Authentication required");
    }

    const count = markAllAsRead(recipientDid);

    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
}
