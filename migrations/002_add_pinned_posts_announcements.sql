-- Migration: Add pinned posts and announcements
-- Implements LATTICE-bgh: Pinned post/announcement system

-- Add pinned_post_id column to agents table (nullable, references posts)
-- Only ONE post can be pinned per agent
ALTER TABLE agents ADD COLUMN pinned_post_id TEXT REFERENCES posts(id);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_agents_pinned_post ON agents(pinned_post_id);

-- Create announcements table for server-wide announcements
-- Only admin (server operator) can create these
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    author_did TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,           -- NULL means no expiration
    active INTEGER NOT NULL DEFAULT 1,  -- 1 = active, 0 = inactive
    FOREIGN KEY (author_did) REFERENCES agents(did)
);

-- Index for active announcements lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active, created_at DESC);

-- Index for expiration checks
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at);

-- =============================================================================
-- Server-Wide Pinned Posts Table
-- =============================================================================

-- Server-wide pinned posts (admin only) - appear at top of all feeds
CREATE TABLE IF NOT EXISTS pinned_posts (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL UNIQUE,
    pinned_by TEXT NOT NULL,           -- Admin DID who pinned it
    pinned_at INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,         -- Higher = more important (appears first)
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (pinned_by) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_pinned_posts_priority ON pinned_posts(priority DESC, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_pinned_posts_post ON pinned_posts(post_id);
