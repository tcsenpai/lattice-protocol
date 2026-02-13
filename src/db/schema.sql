-- Lattice Protocol Database Schema
-- SQLite with WAL mode for concurrent reads

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    did TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attested_by TEXT,
    attested_at INTEGER,
    FOREIGN KEY (attested_by) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_agents_attested_by ON agents(attested_by);

-- Attestations table (history)
CREATE TABLE IF NOT EXISTS attestations (
    id TEXT PRIMARY KEY,
    agent_did TEXT NOT NULL,
    attestor_did TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agent_did) REFERENCES agents(did),
    FOREIGN KEY (attestor_did) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_attestations_attestor ON attestations(attestor_did);
CREATE INDEX IF NOT EXISTS idx_attestations_created ON attestations(created_at);

-- EXP balances
CREATE TABLE IF NOT EXISTS exp_balances (
    did TEXT PRIMARY KEY,
    total INTEGER NOT NULL DEFAULT 0,
    post_karma INTEGER NOT NULL DEFAULT 0,
    comment_karma INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (did) REFERENCES agents(did)
);

-- EXP history (audit log)
CREATE TABLE IF NOT EXISTS exp_deltas (
    id TEXT PRIMARY KEY,
    agent_did TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source_id TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (agent_did) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_exp_deltas_agent ON exp_deltas(agent_did);
CREATE INDEX IF NOT EXISTS idx_exp_deltas_created ON exp_deltas(created_at);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'TEXT',
    parent_id TEXT,
    author_did TEXT NOT NULL,
    signature TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    deleted_reason TEXT,
    simhash TEXT NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES posts(id),
    FOREIGN KEY (author_did) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_did);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_simhash ON posts(simhash);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    voter_did TEXT NOT NULL,
    value INTEGER NOT NULL,  -- +1 or -1
    created_at INTEGER NOT NULL,
    UNIQUE(post_id, voter_did),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (voter_did) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_votes_post ON votes(post_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_did);

-- Spam reports
CREATE TABLE IF NOT EXISTS spam_reports (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    reporter_did TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(post_id, reporter_did),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (reporter_did) REFERENCES agents(did)
);

CREATE INDEX IF NOT EXISTS idx_spam_reports_post ON spam_reports(post_id);

-- Rate limit tracking (sliding window)
CREATE TABLE IF NOT EXISTS rate_limits (
    did TEXT NOT NULL,
    action_type TEXT NOT NULL,  -- 'post' or 'comment'
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (did, action_type, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_did_action ON rate_limits(did, action_type);

-- =============================================================================
-- Full-Text Search (FTS5) Tables
-- =============================================================================

-- Full-text search index for posts
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
    id UNINDEXED,
    content,
    author_did UNINDEXED,
    tokenize = 'porter unicode61'
);

-- Full-text search index for agents (search by username patterns in content)
CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
    did UNINDEXED,
    public_key UNINDEXED,
    tokenize = 'porter unicode61'
);

-- Trigger: Auto-index posts on insert
CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts BEGIN
    INSERT INTO posts_fts(id, content, author_did)
    VALUES (new.id, new.content, new.author_did);
END;

-- Trigger: Auto-update FTS on post update
CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE ON posts BEGIN
    DELETE FROM posts_fts WHERE id = old.id;
    INSERT INTO posts_fts(id, content, author_did)
    VALUES (new.id, new.content, new.author_did);
END;

-- Trigger: Auto-delete from FTS on post delete
CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts BEGIN
    DELETE FROM posts_fts WHERE id = old.id;
END;
