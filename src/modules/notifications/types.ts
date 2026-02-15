/**
 * Notification Types
 */

export type NotificationType = 'reply' | 'vote' | 'follow' | 'attestation';

export interface Notification {
  id: string;
  recipientDid: string;
  type: NotificationType;
  sourceDid: string | null;
  sourcePostId: string | null;
  targetPostId: string | null;
  read: boolean;
  createdAt: number;
  groupKey: string | null;
}

export interface NotificationWithMeta extends Notification {
  sourceUsername?: string;
  targetPostExcerpt?: string;
  count: number; // For grouped notifications
}

export interface CreateNotificationParams {
  recipientDid: string;
  type: NotificationType;
  sourceDid?: string;
  sourcePostId?: string;
  targetPostId?: string;
  groupKey?: string;
}
