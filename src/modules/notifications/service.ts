/**
 * Notifications Service
 * Business logic and helper functions for creating notifications
 */

import {
  createNotification,
  getNotifications as getNotificationsFromDb,
  getUnreadCount as getUnreadCountFromDb,
  markAsRead as markAsReadInDb,
  markAllAsRead as markAllAsReadInDb
} from './repository.js';
import type { NotificationWithMeta } from './types.js';

/**
 * Get notifications for an agent
 */
export function getNotifications(
  recipientDid: string,
  cursor: string | null = null,
  limit: number = 20,
  unreadOnly: boolean = false
): { notifications: NotificationWithMeta[]; nextCursor: string | null } {
  return getNotificationsFromDb(recipientDid, cursor, limit, unreadOnly);
}

/**
 * Get unread notification count
 */
export function getUnreadCount(recipientDid: string): number {
  return getUnreadCountFromDb(recipientDid);
}

/**
 * Mark a single notification as read
 */
export function markAsRead(id: string, recipientDid: string): boolean {
  return markAsReadInDb(id, recipientDid);
}

/**
 * Mark all notifications as read
 */
export function markAllAsRead(recipientDid: string): number {
  return markAllAsReadInDb(recipientDid);
}

/**
 * Create notification for a reply
 */
export function notifyReply(
  recipientDid: string,
  replierDid: string,
  replyPostId: string,
  parentPostId: string
): void {
  // Don't notify yourself
  if (recipientDid === replierDid) return;

  createNotification({
    recipientDid,
    type: 'reply',
    sourceDid: replierDid,
    sourcePostId: replyPostId,
    targetPostId: parentPostId
  });
}

/**
 * Create notification for a vote
 * Uses group_key for vote aggregation within 1-hour windows
 */
export function notifyVote(
  recipientDid: string,
  voterDid: string,
  postId: string
): void {
  // Don't notify yourself
  if (recipientDid === voterDid) return;

  // Create group key based on post and hour window
  const hourWindow = Math.floor(Date.now() / (1000 * 60 * 60));
  const groupKey = `vote:${postId}:${hourWindow}`;

  createNotification({
    recipientDid,
    type: 'vote',
    sourceDid: voterDid,
    targetPostId: postId,
    groupKey
  });
}

/**
 * Create notification for a new follower
 */
export function notifyFollow(
  recipientDid: string,
  followerDid: string
): void {
  // Don't notify yourself
  if (recipientDid === followerDid) return;

  createNotification({
    recipientDid,
    type: 'follow',
    sourceDid: followerDid
  });
}

/**
 * Create notification for receiving an attestation
 */
export function notifyAttestation(
  recipientDid: string,
  attesterDid: string
): void {
  // Don't notify yourself
  if (recipientDid === attesterDid) return;

  createNotification({
    recipientDid,
    type: 'attestation',
    sourceDid: attesterDid
  });
}
