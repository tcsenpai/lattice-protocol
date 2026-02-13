/**
 * Post Service
 * Business logic for creating, retrieving, and deleting posts
 * with spam detection and rate limiting integration
 */

import { generateId } from '../../utils/ulid.js';
import { now } from '../../utils/time.js';
import { createPost as createPostInDb, getPost as getPostFromDb, softDelete, postExists } from './repository.js';
import { checkContent, getContentSimHash } from '../spam/service.js';
import { getAgentEXP, penalizeSpam } from '../exp/service.js';
import { checkRateLimit, recordAction } from '../exp/rate-limiter.js';
import { getAgent } from '../identity/repository.js';
import type { CreatePostRequest, Post, PostWithAuthor, SpamCheckResult } from '../../types/index.js';

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

  return {
    ...post,
    author: {
      did: post.authorDid,
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
