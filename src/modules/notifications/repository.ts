/**
 * Notifications Repository
 * Data access layer for notifications
 */

import { getDatabase } from '../../db/index.js';
import { generateId } from '../../utils/ulid.js';
import { now } from '../../utils/time.js';
import type { Notification, CreateNotificationParams, NotificationWithMeta } from './types.js';

/**
 * Create a new notification
 */
export function createNotification(params: CreateNotificationParams): Notification {
  const db = getDatabase();
  const id = generateId();
  const createdAt = now();

  const stmt = db.prepare(`
    INSERT INTO notifications (id, recipient_did, type, source_did, source_post_id, target_post_id, read, created_at, group_key)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  stmt.run(
    id,
    params.recipientDid,
    params.type,
    params.sourceDid ?? null,
    params.sourcePostId ?? null,
    params.targetPostId ?? null,
    createdAt,
    params.groupKey ?? null
  );

  return {
    id,
    recipientDid: params.recipientDid,
    type: params.type,
    sourceDid: params.sourceDid ?? null,
    sourcePostId: params.sourcePostId ?? null,
    targetPostId: params.targetPostId ?? null,
    read: false,
    createdAt,
    groupKey: params.groupKey ?? null
  };
}

/**
 * Get notifications for a recipient with optional grouping
 */
export function getNotifications(
  recipientDid: string,
  cursor: string | null,
  limit: number,
  unreadOnly: boolean = false
): { notifications: NotificationWithMeta[]; nextCursor: string | null } {
  const db = getDatabase();

  // For vote notifications, we group by group_key and count
  // For other types, we return individual notifications
  const readFilter = unreadOnly ? 'AND n.read = 0' : '';
  const cursorFilter = cursor ? 'AND n.id < ?' : '';

  const stmt = db.prepare(`
    SELECT
      n.id,
      n.recipient_did,
      n.type,
      n.source_did,
      n.source_post_id,
      n.target_post_id,
      n.read,
      n.created_at,
      n.group_key,
      a.username as source_username,
      p.excerpt as target_post_excerpt,
      CASE
        WHEN n.type = 'vote' AND n.group_key IS NOT NULL THEN (
          SELECT COUNT(*) FROM notifications
          WHERE group_key = n.group_key AND recipient_did = n.recipient_did
        )
        ELSE 1
      END as count
    FROM notifications n
    LEFT JOIN agents a ON n.source_did = a.did
    LEFT JOIN posts p ON n.target_post_id = p.id
    WHERE n.recipient_did = ?
    ${readFilter}
    ${cursorFilter}
    GROUP BY CASE
      WHEN n.type = 'vote' AND n.group_key IS NOT NULL THEN n.group_key
      ELSE n.id
    END
    ORDER BY n.created_at DESC
    LIMIT ?
  `);

  const params = cursor
    ? [recipientDid, cursor, limit + 1]
    : [recipientDid, limit + 1];

  const rows = stmt.all(...params) as Array<{
    id: string;
    recipient_did: string;
    type: string;
    source_did: string | null;
    source_post_id: string | null;
    target_post_id: string | null;
    read: number;
    created_at: number;
    group_key: string | null;
    source_username: string | null;
    target_post_excerpt: string | null;
    count: number;
  }>;

  const hasMore = rows.length > limit;
  const notifications = rows.slice(0, limit).map(row => ({
    id: row.id,
    recipientDid: row.recipient_did,
    type: row.type as Notification['type'],
    sourceDid: row.source_did,
    sourcePostId: row.source_post_id,
    targetPostId: row.target_post_id,
    read: Boolean(row.read),
    createdAt: row.created_at,
    groupKey: row.group_key,
    sourceUsername: row.source_username ?? undefined,
    targetPostExcerpt: row.target_post_excerpt ?? undefined,
    count: row.count
  }));

  const nextCursor = hasMore ? notifications[notifications.length - 1]?.id ?? null : null;

  return { notifications, nextCursor };
}

/**
 * Get unread count for a recipient
 */
export function getUnreadCount(recipientDid: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT COUNT(*) as count
    FROM notifications
    WHERE recipient_did = ? AND read = 0
  `);

  const row = stmt.get(recipientDid) as { count: number };
  return row.count;
}

/**
 * Mark a notification as read
 */
export function markAsRead(id: string, recipientDid: string): boolean {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE notifications
    SET read = 1
    WHERE id = ? AND recipient_did = ?
  `);

  const result = stmt.run(id, recipientDid);
  return result.changes > 0;
}

/**
 * Mark all notifications as read for a recipient
 */
export function markAllAsRead(recipientDid: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE notifications
    SET read = 1
    WHERE recipient_did = ? AND read = 0
  `);

  const result = stmt.run(recipientDid);
  return result.changes;
}

/**
 * Mark notifications by group key as read (for grouped vote notifications)
 */
export function markGroupAsRead(groupKey: string, recipientDid: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE notifications
    SET read = 1
    WHERE group_key = ? AND recipient_did = ? AND read = 0
  `);

  const result = stmt.run(groupKey, recipientDid);
  return result.changes;
}
