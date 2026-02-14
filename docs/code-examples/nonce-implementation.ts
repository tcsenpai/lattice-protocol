/**
 * Nonce-Based Replay Protection Implementation
 *
 * This file demonstrates the key implementation changes required
 * for nonce-based replay protection in the authentication middleware.
 *
 * DO NOT use directly - this is for reference only.
 * Actual implementation will be in src/api/middleware/auth.ts
 */

import { LRUCache } from 'lru-cache';
import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface NonceMetadata {
  timestamp: number;
  did: string;
  endpoint: string;
}

interface NonceCacheConfig {
  maxSize: number;
  ttl: number;
}

// ============================================================================
// NONCE CACHE INITIALIZATION
// ============================================================================

const NONCE_CACHE_CONFIG: NonceCacheConfig = {
  maxSize: 10000,        // Maximum 10,000 entries
  ttl: 5 * 60 * 1000,    // 5 minutes TTL (matches timestamp window)
};

/**
 * LRU cache for nonce tracking
 *
 * Configuration:
 * - max: 10,000 entries (~1.24 MB memory)
 * - ttl: 5 minutes (auto-expire old entries)
 * - eviction: LRU (Least Recently Used)
 *
 * Performance:
 * - O(1) get/set operations
 * - ~0.05ms lookup time
 * - Automatic cleanup
 */
const nonceCache = new LRUCache<string, NonceMetadata>({
  max: NONCE_CACHE_CONFIG.maxSize,
  ttl: NONCE_CACHE_CONFIG.ttl,
  allowStale: false,
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

// ============================================================================
// NONCE VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate that a string is a properly formatted UUIDv4
 *
 * UUIDv4 format:
 * - 8-4-4-4-12 hexadecimal digits
 * - Version 4 (random): 4xxx in third group
 * - Variant: 8, 9, a, or b in first hex of fourth group
 *
 * Examples:
 * - Valid: 550e8400-e29b-41d4-a716-446655440000
 * - Invalid: 550e8400-e29b-31d4-a716-446655440000 (version 3, not 4)
 * - Invalid: not-a-uuid
 * - Invalid: 550e8400e29b41d4a716446655440000 (no hyphens)
 */
function isValidUUIDv4(uuid: string): boolean {
  const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv4Regex.test(uuid);
}

/**
 * Extract nonce from request headers
 *
 * Header name: x-nonce
 * Expected format: UUIDv4 string
 */
function extractNonce(req: Request): string | null {
  return (req.headers['x-nonce'] as string | undefined) || null;
}

// ============================================================================
// UPDATED AUTH HEADER EXTRACTION
// ============================================================================

/**
 * Extract ALL authentication headers including nonce
 *
 * Required headers:
 * - x-did: Agent's DID identifier
 * - x-signature: Ed25519 signature (base64)
 * - x-timestamp: Unix timestamp in milliseconds
 * - x-nonce: UUIDv4 nonce (NEW)
 */
function extractAuthHeaders(req: Request): {
  did: string | null;
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;  // NEW FIELD
} {
  return {
    did: (req.headers['x-did'] as string | undefined) || null,
    signature: (req.headers['x-signature'] as string | undefined) || null,
    timestamp: (req.headers['x-timestamp'] as string | undefined) || null,
    nonce: (req.headers['x-nonce'] as string | undefined) || null,  // NEW
  };
}

// ============================================================================
// UPDATED SIGNED MESSAGE BUILDER
// ============================================================================

/**
 * Build message to verify from request
 *
 * NEW FORMAT: METHOD:PATH:TIMESTAMP:NONCE:BODY_HASH
 * OLD FORMAT: METHOD:PATH:TIMESTAMP:BODY_HASH (deprecated)
 *
 * The nonce is included in the signed message to prevent attackers
 * from swapping nonces while reusing signatures.
 *
 * Example new format:
 * POST:/api/v1/posts:1707932400000:550e8400-e29b-41d4-a716-446655440000:{"content":"hello"}
 *
 * @param req - Express request object
 * @param timestamp - Timestamp from x-timestamp header
 * @param nonce - Nonce from x-nonce header
 * @returns Encoded message bytes ready for signature verification
 */
function buildSignedMessage(
  req: Request,
  timestamp: string,
  nonce: string  // NEW PARAMETER
): Uint8Array {
  const method = req.method;
  const path = req.originalUrl;
  const bodyHash = req.body ? JSON.stringify(req.body) : "";

  // NEW: Include nonce in message
  const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
  return new TextEncoder().encode(message);
}

// ============================================================================
// NONCE CACHE OPERATIONS
// ============================================================================

/**
 * Check if nonce has been used before (replay detection)
 *
 * @param nonce - Nonce to check
 * @returns NonceMetadata if found (replay), null if not found (legitimate)
 */
function checkNonceCache(nonce: string): NonceMetadata | null {
  const existing = nonceCache.get(nonce);
  return existing ?? null;
}

/**
 * Store nonce in cache after successful authentication
 *
 * Metadata stored:
 * - timestamp: When nonce was first used
 * - did: Which DID used this nonce
 * - endpoint: Which endpoint was accessed
 *
 * This metadata is used for:
 * - Security logging (replay attempt detection)
 * - Audit trails
 * - Debugging
 *
 * @param nonce - Nonce to store
 * @param metadata - Context about the request
 */
function storeNonce(nonce: string, metadata: NonceMetadata): void {
  nonceCache.set(nonce, metadata);
}

/**
 * Get cache statistics for monitoring
 *
 * Useful for:
 * - Performance monitoring
 * - Capacity planning
 * - Security alerting
 */
function getNonceStats() {
  return {
    size: nonceCache.size,
    maxSize: NONCE_CACHE_CONFIG.maxSize,
    utilizationPercent: (nonceCache.size / NONCE_CACHE_CONFIG.maxSize) * 100,
  };
}

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * New error codes for nonce validation
 */
const AuthErrorCodes = {
  // Existing codes
  AUTH_MISSING_HEADERS: 'AUTH_MISSING_HEADERS',
  AUTH_TIMESTAMP_INVALID: 'AUTH_TIMESTAMP_INVALID',
  AUTH_INVALID_DID: 'AUTH_INVALID_DID',
  AUTH_AGENT_NOT_FOUND: 'AUTH_AGENT_NOT_FOUND',
  AUTH_SIGNATURE_INVALID: 'AUTH_SIGNATURE_INVALID',
  AUTH_VERIFICATION_ERROR: 'AUTH_VERIFICATION_ERROR',

  // NEW: Nonce-related errors
  AUTH_MISSING_NONCE: 'AUTH_MISSING_NONCE',
  AUTH_INVALID_NONCE: 'AUTH_INVALID_NONCE',
  AUTH_REPLAY_DETECTED: 'AUTH_REPLAY_DETECTED',
} as const;

// ============================================================================
// UPDATED AUTH MIDDLEWARE (PSEUDO-CODE)
// ============================================================================

/**
 * Updated authentication middleware with nonce validation
 *
 * NEW VALIDATION STEPS (in order):
 * 1. Extract headers (including nonce)
 * 2. Validate all headers present
 * 3. Validate nonce format (UUIDv4)
 * 4. Check nonce cache (replay detection) ← NEW
 * 5. Validate timestamp
 * 6. Validate DID format
 * 7. Check agent exists
 * 8. Build signed message (with nonce) ← UPDATED
 * 9. Verify signature
 * 10. Store nonce in cache ← NEW
 * 11. Set authenticated DID
 *
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
async function authMiddlewareWithNonce(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Extract headers (including nonce)
  const { did, signature, timestamp, nonce } = extractAuthHeaders(req);

  // 2. Validate all headers present
  if (!did || !signature || !timestamp || !nonce) {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.AUTH_MISSING_HEADERS,
        message: 'Missing required authentication headers: x-did, x-signature, x-timestamp, x-nonce',
      },
    });
    return;
  }

  // 3. NEW: Validate nonce format (UUIDv4)
  if (!isValidUUIDv4(nonce)) {
    res.status(401).json({
      error: {
        code: AuthErrorCodes.AUTH_INVALID_NONCE,
        message: 'Invalid nonce format. Expected UUIDv4',
      },
    });
    return;
  }

  // 4. NEW: Check nonce cache (REPLAY DETECTION)
  const existingNonce = checkNonceCache(nonce);
  if (existingNonce) {
    // Log replay attempt for security monitoring
    console.warn('[SECURITY] Replay attack detected', {
      nonce,
      did,
      endpoint: req.path,
      originalTimestamp: existingNonce.timestamp,
      attemptTimestamp: Date.now(),
      timeDelta: Date.now() - existingNonce.timestamp,
    });

    res.status(401).json({
      error: {
        code: AuthErrorCodes.AUTH_REPLAY_DETECTED,
        message: 'Request replay detected. Nonce already used',
      },
    });
    return;
  }

  // 5. Validate timestamp (existing logic)
  // ... (same as before)

  // 6. Validate DID format (existing logic)
  // ... (same as before)

  // 7. Check agent exists (existing logic)
  // ... (same as before)

  // 8. UPDATED: Build signed message with nonce
  const message = buildSignedMessage(req, timestamp, nonce);

  // 9. Verify signature (existing logic)
  // ... (same as before, but using updated message)

  // 10. NEW: Store nonce in cache after successful verification
  storeNonce(nonce, {
    timestamp: Date.now(),
    did,
    endpoint: req.path,
  });

  // 11. Set authenticated DID (existing logic)
  req.authenticatedDid = did;
  next();
}

// ============================================================================
// MIGRATION HELPER FUNCTIONS
// ============================================================================

/**
 * Transitional signature builder that supports both old and new formats
 *
 * Use during migration phase to support clients that haven't updated yet.
 *
 * Phase 1: nonce optional, use new format if present
 * Phase 2: nonce required, always use new format
 *
 * @param req - Express request
 * @param timestamp - Timestamp from header
 * @param nonce - Nonce from header (optional during migration)
 * @returns Signed message in appropriate format
 */
function buildSignedMessageTransitional(
  req: Request,
  timestamp: string,
  nonce?: string
): Uint8Array {
  const method = req.method;
  const path = req.originalUrl;
  const bodyHash = req.body ? JSON.stringify(req.body) : "";

  if (nonce) {
    // New format (with nonce)
    const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
    return new TextEncoder().encode(message);
  } else {
    // Legacy format (without nonce)
    const message = `${method}:${path}:${timestamp}:${bodyHash}`;
    return new TextEncoder().encode(message);
  }
}

// ============================================================================
// MONITORING & OBSERVABILITY
// ============================================================================

/**
 * Log nonce cache statistics periodically
 *
 * Call this from a periodic timer (e.g., every 5 minutes) to monitor:
 * - Cache utilization
 * - Potential memory issues
 * - Attack patterns
 */
function logNonceStatistics(): void {
  const stats = getNonceStats();

  console.info('[NONCE_CACHE] Statistics', {
    size: stats.size,
    maxSize: stats.maxSize,
    utilization: `${stats.utilizationPercent.toFixed(2)}%`,
    timestamp: new Date().toISOString(),
  });

  // Alert if cache is >80% full
  if (stats.utilizationPercent > 80) {
    console.warn('[NONCE_CACHE] High utilization detected', {
      utilization: `${stats.utilizationPercent.toFixed(2)}%`,
      recommendation: 'Consider increasing maxSize or monitoring for attack',
    });
  }
}

/**
 * Track replay attempts for security monitoring
 */
interface ReplayAttemptMetrics {
  totalAttempts: number;
  uniqueNonces: Set<string>;
  uniqueDids: Set<string>;
  endpoints: Map<string, number>;
}

const replayMetrics: ReplayAttemptMetrics = {
  totalAttempts: 0,
  uniqueNonces: new Set(),
  uniqueDids: new Set(),
  endpoints: new Map(),
};

function trackReplayAttempt(nonce: string, did: string, endpoint: string): void {
  replayMetrics.totalAttempts++;
  replayMetrics.uniqueNonces.add(nonce);
  replayMetrics.uniqueDids.add(did);
  replayMetrics.endpoints.set(
    endpoint,
    (replayMetrics.endpoints.get(endpoint) ?? 0) + 1
  );
}

// ============================================================================
// CLIENT IMPLEMENTATION EXAMPLE
// ============================================================================

/**
 * Example client-side implementation for generating authenticated requests
 *
 * This shows how clients should update their code to include nonces.
 */
async function createAuthenticatedRequest(
  method: string,
  path: string,
  body: object | null,
  privateKey: Uint8Array,
  did: string
): Promise<{
  headers: Record<string, string>;
  body: string | null;
}> {
  // 1. Generate nonce (UUIDv4)
  // NOTE: In real implementation, use crypto.randomUUID() or uuid package
  const nonce = '550e8400-e29b-41d4-a716-446655440000'; // Example UUID

  // 2. Generate timestamp
  const timestamp = Date.now().toString();

  // 3. Build message to sign
  const bodyHash = body ? JSON.stringify(body) : '';
  const message = `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`;
  const messageBytes = new TextEncoder().encode(message);

  // 4. Sign message
  // NOTE: In real implementation, use ed25519 library
  const signature = 'base64_signature_here'; // Placeholder

  // 5. Return headers and body
  return {
    headers: {
      'x-did': did,
      'x-signature': signature,
      'x-timestamp': timestamp,
      'x-nonce': nonce, // NEW HEADER
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  };
}

// ============================================================================
// TESTING HELPERS
// ============================================================================

/**
 * Clear nonce cache (for testing only)
 *
 * Use this in test teardown to ensure clean state between tests.
 */
function clearNonceCache(): void {
  nonceCache.clear();
}

/**
 * Generate valid UUIDv4 for testing
 *
 * In real tests, use crypto.randomUUID() or uuid package.
 */
function generateTestNonce(): string {
  // Simple UUIDv4 generator for testing
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Test scenarios for nonce validation
 */
const testScenarios = {
  validNonce: {
    nonce: '550e8400-e29b-41d4-a716-446655440000',
    expectedResult: 'accept',
  },
  invalidFormat: {
    nonce: 'not-a-uuid',
    expectedResult: 'AUTH_INVALID_NONCE',
  },
  missingNonce: {
    nonce: null,
    expectedResult: 'AUTH_MISSING_NONCE',
  },
  replayedNonce: {
    nonce: '550e8400-e29b-41d4-a716-446655440000', // Same as first request
    expectedResult: 'AUTH_REPLAY_DETECTED',
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Types
  NonceMetadata,
  NonceCacheConfig,

  // Functions
  isValidUUIDv4,
  extractNonce,
  extractAuthHeaders,
  buildSignedMessage,
  buildSignedMessageTransitional,
  checkNonceCache,
  storeNonce,
  getNonceStats,

  // Monitoring
  logNonceStatistics,
  trackReplayAttempt,

  // Testing
  clearNonceCache,
  generateTestNonce,

  // Constants
  AuthErrorCodes,
  NONCE_CACHE_CONFIG,
};
