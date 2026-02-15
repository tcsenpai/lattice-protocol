/**
 * Post Service
 * Business logic for creating, retrieving, and deleting posts
 * with spam detection and rate limiting integration
 */

import { generateId } from '../../utils/ulid.js';
import { now } from '../../utils/time.js';
import { createPost as createPostInDb, getPost as getPostFromDb, softDelete, postExists, updatePost as updatePostInDb } from './repository.js';
import { checkContent, getContentSimHash } from '../spam/service.js';
import { checkInjection } from '../spam/injection-detector.js';
import { getAgentEXP, penalizeSpam } from '../exp/service.js';
import { checkRateLimit, recordAction } from '../exp/rate-limiter.js';
import { getAgent } from '../identity/repository.js';
import { processPostTopics } from './topic-service.js';
import type { CreatePostRequest, EditPostRequest, Post, PostWithAuthor, SpamCheckResult } from '../../types/index.js';

/** Edit window in seconds (5 minutes) */
const EDIT_WINDOW_SECONDS = 5 * 60;

/**
 * Result of creating a post with spam check
 */
export interface CreatePostResult {
  post: Post | null;
  spamResult: SpamCheckResult;
  rateLimitResult: { allowed: boolean; remaining: number };
}

/**
 * Create a new post with spam check and rate limiting
 *
 * Flow:
 * 1. Check rate limit based on author's level
 * 2. Get author info for spam check (account age)
 * 3. Run spam detection (SimHash + entropy + account age)
 * 4. If spam rejected, apply penalty and return
 * 5. If passed, create post with SimHash fingerprint
 * 6. Record action for rate limiting
 *
 * @param request - The post creation request
 * @returns CreatePostResult with post, spam result, and rate limit info
 * @throws Error if author not found
 */
export function createPostWithSpamCheck(
  request: CreatePostRequest
): CreatePostResult {
  // Check rate limit
  const actionType = request.parentId ? 'comment' : 'post';
  const rateLimitResult = checkRateLimit(request.authorDid, actionType);

  if (!rateLimitResult.allowed) {
    return {
      post: null,
      spamResult: { isSpam: false, reason: null, similarity: null, entropy: null, action: 'PUBLISH' },
      rateLimitResult: { allowed: false, remaining: 0 }
    };
  }

  // Get author info for spam check
  const agent = getAgent(request.authorDid);
  if (!agent) {
    throw new Error('Author not found');
  }

  // Check for prompt injection attacks
  const injectionResult = checkInjection(request.content);
  if (injectionResult.action === 'REJECT') {
    return {
      post: null,
      spamResult: {
        isSpam: true,
        reason: 'prompt_injection',
        similarity: null,
        entropy: null,
        action: 'REJECT'
      },
      rateLimitResult: { allowed: true, remaining: rateLimitResult.remaining }
    };
  }

  const accountAgeSeconds = now() - agent.createdAt;

  // Check for spam
  const spamResult = checkContent(request.content, request.authorDid, accountAgeSeconds);

  // Handle spam rejection
  if (spamResult.action === 'REJECT') {
    // Apply penalty for detected spam
    penalizeSpam(request.authorDid, 'detected', '');
    return {
      post: null,
      spamResult,
      rateLimitResult: { allowed: true, remaining: rateLimitResult.remaining }
    };
  }

  // Create post with SimHash fingerprint
  const id = generateId();
  const simhash = getContentSimHash(request.content);

  const post = createPostInDb({
    id,
    content: request.content,
    contentType: request.contentType,
    parentId: request.parentId,
    authorDid: request.authorDid,
    signature: request.signature,
    simhash
  });

  // Extract and save topics/hashtags
  processPostTopics(post.id, request.content);

  // Record action for rate limiting
  recordAction(request.authorDid, actionType);

  return {
    post,
    spamResult,
    rateLimitResult: { allowed: true, remaining: rateLimitResult.remaining - 1 }
  };
}

/**
 * Get post with author information
 * Includes author's level and total EXP
 *
 * @param id - The post ID
 * @returns PostWithAuthor or null if not found
 */
export function getPostWithAuthor(id: string): PostWithAuthor | null {
  const post = getPostFromDb(id);
  if (!post) return null;

  const authorEXP = getAgentEXP(post.authorDid);
  const agent = getAgent(post.authorDid);

  return {
    ...post,
    author: {
      did: post.authorDid,
      username: agent?.username ?? null,
      level: authorEXP?.level ?? 0,
      totalEXP: authorEXP?.total ?? 0
    }
  };
}

/**
 * Delete a post (soft delete)
 * Only the author can delete their own post unless it's a moderation action
 *
 * @param id - The post ID to delete
 * @param requesterDid - The DID of the person requesting deletion
 * @param isModeration - Whether this is a moderation action (bypasses author check)
 * @returns true if post was deleted
 * @throws Error if post not found or not authorized
 */
export function deletePost(
  id: string,
  requesterDid: string,
  isModeration: boolean = false
): boolean {
  const post = getPostFromDb(id);
  if (!post) {
    throw new Error('Post not found');
  }

  // Check authorization
  if (!isModeration && post.authorDid !== requesterDid) {
    throw new Error('Not authorized to delete this post');
  }

  const reason = isModeration ? 'moderation' : 'author';
  return softDelete(id, reason);
}

/**
 * Get a post by ID
 * Simple wrapper around repository for service interface
 *
 * @param id - The post ID
 * @returns Post or null if not found
 */
export function getPost(id: string): Post | null {
  return getPostFromDb(id);
}

/**
 * Check if a post exists
 *
 * @param id - The post ID
 * @returns true if post exists
 */
export function checkPostExists(id: string): boolean {
  return postExists(id);
}

/**
 * Result of editing a post
 */
export interface EditPostResult {
  success: boolean;
  post: Post | null;
  error?: string;
}

/**
 * Edit an existing post
 * Only allowed within 5-minute window after creation
 * Only the author can edit their own post
 *
 * @param id - The post ID to edit
 * @param requesterDid - The DID of the person requesting edit
 * @param updates - The content updates
 * @returns EditPostResult with success status and updated post
 */
export function editPost(
  id: string,
  requesterDid: string,
  updates: EditPostRequest
): EditPostResult {
  const post = getPostFromDb(id);
  if (!post) {
    return { success: false, post: null, error: 'Post not found' };
  }

  // Check authorization - only author can edit
  if (post.authorDid !== requesterDid) {
    return { success: false, post: null, error: 'Not authorized to edit this post' };
  }

  // Check if post is deleted
  if (post.deleted) {
    return { success: false, post: null, error: 'Cannot edit deleted post' };
  }

  // Check edit window (5 minutes from creation)
  const currentTime = now();
  const timeSinceCreation = currentTime - post.createdAt;
  if (timeSinceCreation > EDIT_WINDOW_SECONDS) {
    return { success: false, post: null, error: 'Edit window expired (5 minutes)' };
  }

  // Check for prompt injection in new content
  const injectionResult = checkInjection(updates.content);
  if (injectionResult.action === 'REJECT') {
    return { success: false, post: null, error: 'Content rejected: prompt injection detected' };
  }

  // Recalculate simhash for spam detection
  const simhash = getContentSimHash(updates.content);

  // Update the post
  const updated = updatePostInDb(id, {
    content: updates.content,
    title: updates.title,
    excerpt: updates.excerpt,
    simhash
  });

  if (!updated) {
    return { success: false, post: null, error: 'Failed to update post' };
  }

  // Re-process topics in case hashtags changed
  processPostTopics(id, updates.content);

  // Return updated post
  const updatedPost = getPostFromDb(id);
  return { success: true, post: updatedPost };
}
