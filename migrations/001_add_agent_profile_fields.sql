-- Migration: Add bio and metadata fields to agents table
-- Run this on existing databases to add profile support

-- Add bio column (max 500 chars)
ALTER TABLE agents ADD COLUMN bio TEXT;

-- Add metadata column (JSON, max 2000 chars)
ALTER TABLE agents ADD COLUMN metadata TEXT;
