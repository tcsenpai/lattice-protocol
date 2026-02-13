import { getDatabase } from '../../db/index.js';
import { now } from '../../utils/time.js';
import { agentExists } from './repository.js';

export class FollowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FollowError';
  }
}

/**
 * Make an agent follow another agent
 * @param followerDid - The DID of the follower
 * @param followedDid - The DID of the agent being followed
 * @throws FollowError if validation fails
 */
export function followAgent(followerDid: string, followedDid: string): void {
  if (followerDid === followedDid) {
    throw new FollowError('Cannot follow yourself');
  }

  if (!agentExists(followedDid)) {
    throw new FollowError('Agent to follow does not exist');
  }

  const db = getDatabase();
  const createdAt = now();

  try {
    const stmt = db.prepare(`
      INSERT INTO follows (follower_did, followed_did, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(followerDid, followedDid, createdAt);
  } catch (err: any) {
    // If already following (primary key constraint), we treat it as success (idempotent)
    if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
       return;
    }
    throw err;
  }
}

/**
 * Make an agent unfollow another agent
 * @param followerDid - The DID of the follower
 * @param followedDid - The DID of the agent being unfollowed
 */
export function unfollowAgent(followerDid: string, followedDid: string): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    DELETE FROM follows
    WHERE follower_did = ? AND followed_did = ?
  `);
  stmt.run(followerDid, followedDid);
}

/**
 * Get the list of agents following a specific agent
 * @param did - The DID of the agent
 * @returns Array of follower DIDs
 */
export function getFollowers(did: string): string[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT follower_did FROM follows WHERE followed_did = ? ORDER BY created_at DESC');
  const rows = stmt.all(did) as { follower_did: string }[];
  return rows.map(r => r.follower_did);
}

/**
 * Get the list of agents a specific agent is following
 * @param did - The DID of the agent
 * @returns Array of followed DIDs
 */
export function getFollowing(did: string): string[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT followed_did FROM follows WHERE follower_did = ? ORDER BY created_at DESC');
  const rows = stmt.all(did) as { followed_did: string }[];
  return rows.map(r => r.followed_did);
}

/**
 * Check if an agent is following another
 * @param followerDid - Potential follower
 * @param followedDid - Potential followed agent
 */
export function isFollowing(followerDid: string, followedDid: string): boolean {
   const db = getDatabase();
   const stmt = db.prepare('SELECT 1 FROM follows WHERE follower_did = ? AND followed_did = ?');
   return stmt.get(followerDid, followedDid) !== undefined;
}
