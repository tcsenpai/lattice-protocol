import { getDatabase } from '../../db/index.js';
import { now } from '../../utils/time.js';

export interface Topic {
  id: number;
  name: string;
  postCount: number;
}

/**
 * Extract unique hashtags from content
 * @param content - Post content
 * @returns Array of lowercase hashtags without #
 */
export function extractHashtags(content: string): string[] {
  // Matches #hashtag but not inside words (basic regex)
  // Supports letters, numbers, underscores
  const matches = content.match(/(?:^|\s)#([a-zA-Z0-9_]+)/g);
  if (!matches) return [];
  
  // Clean up matches (remove leading space and #) and unique lowercase
  return [...new Set(matches.map(tag => {
    return tag.trim().substring(1).toLowerCase();
  }))];
}

/**
 * Process hashtags in a new post
 * Creates topics if they don't exist and links them to the post
 * @param postId - ID of the new post
 * @param content - Content of the post
 */
export function processPostTopics(postId: string, content: string): void {
  const hashtags = extractHashtags(content);
  if (hashtags.length === 0) return;

  const db = getDatabase();
  const timestamp = now();

  // Transaction to ensure data consistency
  const transaction = db.transaction(() => {
    const insertTopic = db.prepare(`
      INSERT OR IGNORE INTO topics (name, created_at, post_count)
      VALUES (?, ?, 0)
    `);

    const getTopicId = db.prepare('SELECT id FROM topics WHERE name = ?');
    
    const incrementCount = db.prepare('UPDATE topics SET post_count = post_count + 1 WHERE id = ?');
    
    const insertLink = db.prepare(`
      INSERT INTO post_topics (post_id, topic_id, created_at)
      VALUES (?, ?, ?)
    `);

    for (const tag of hashtags) {
      try {
        // Ensure topic exists
        insertTopic.run(tag, timestamp);
        
        // Get ID
        const topic = getTopicId.get(tag) as { id: number };
        
        if (topic) {
          // Create link
          insertLink.run(postId, topic.id, timestamp);
          
          // Increment count
          incrementCount.run(topic.id);
        }
      } catch (err: any) {
        // Ignore UNIQUE constraint if we somehow process same tag twice for same post (shouldn't happen with Set)
        if (err.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          console.error(`[Topics] Error processing tag ${tag}:`, err);
        }
      }
    }
  });

  transaction();
}

/**
 * Get trending topics
 * @param limit - Number of topics to return
 */
export function getTrendingTopics(limit: number = 10): Topic[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, post_count as postCount
    FROM topics
    ORDER BY post_count DESC
    LIMIT ?
  `);
  
  return stmt.all(limit) as Topic[];
}

/**
 * Search topics by name (prefix search)
 * @param query - Search query
 * @param limit - Max results
 */
export function searchTopics(query: string, limit: number = 10): Topic[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT id, name, post_count as postCount
    FROM topics
    WHERE name LIKE ?
    ORDER BY post_count DESC
    LIMIT ?
  `);
  
  return stmt.all(`${query}%`, limit) as Topic[];
}
