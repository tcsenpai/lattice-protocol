/**
 * DID Auth Middleware
 * Verifies Ed25519 signatures for authenticated requests
 */

import type { Request, Response, NextFunction } from "express";
import { LRUCache } from "lru-cache";
import { verifyDIDSignature } from "../../modules/identity/did-service.js";
import { getAgent } from "../../modules/identity/repository.js";

/**
 * Maximum allowed timestamp drift in milliseconds (5 minutes)
 */
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

/**
 * LRU cache for tracking used nonces to prevent replay attacks
 * Max 10,000 entries with 5-minute TTL matching timestamp window
 */
const nonceCache = new LRUCache<string, boolean>({
  max: 10000,
  ttl: MAX_TIMESTAMP_DRIFT_MS,
});

/**
 * Extend Express Request to include authenticated DID and raw body
 */
declare global {
  namespace Express {
    interface Request {
      authenticatedDid?: string;
      rawBody?: Buffer;
    }
  }
}

/**
 * Extract authentication headers from request
 */
function extractAuthHeaders(req: Request): {
  did: string | null;
  signature: string | null;
  timestamp: string | null;
  nonce: string | null;
} {
  return {
    did: (req.headers["x-did"] as string | undefined) || null,
    signature: (req.headers["x-signature"] as string | undefined) || null,
    timestamp: (req.headers["x-timestamp"] as string | undefined) || null,
    nonce: (req.headers["x-nonce"] as string | undefined) || null,
  };
}

/**
 * Validate timestamp is within acceptable range
 */
function validateTimestamp(timestamp: string): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const now = Date.now();
  const drift = Math.abs(now - ts);
  return drift <= MAX_TIMESTAMP_DRIFT_MS;
}

/**
 * Validate nonce format (UUIDv4 or similar unique identifier)
 */
function validateNonceFormat(nonce: string): boolean {
  // Accept UUIDv4 format or any 16-64 character alphanumeric string
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const simpleNonceRegex = /^[a-zA-Z0-9_-]{16,64}$/;
  return uuidRegex.test(nonce) || simpleNonceRegex.test(nonce);
}

/**
 * Check if nonce has been used (replay detection)
 * Returns true if nonce is fresh and unused
 */
function checkAndStoreNonce(did: string, nonce: string): boolean {
  const key = `${did}:${nonce}`;
  if (nonceCache.has(key)) {
    return false; // Replay detected
  }
  nonceCache.set(key, true);
  return true;
}

/**
 * Build message to verify from request
 * Format: METHOD:PATH:TIMESTAMP:NONCE:BODY_HASH (with nonce)
 * Format: METHOD:PATH:TIMESTAMP:BODY_HASH (without nonce, backward compatible)
 * Uses raw body buffer to ensure signature verification matches original request
 */
function buildSignedMessage(req: Request, timestamp: string, nonce: string | null): Uint8Array {
  const method = req.method;
  const path = req.originalUrl;
  const bodyHash = req.rawBody ? req.rawBody.toString() : (req.body ? JSON.stringify(req.body) : "");

  // New format: METHOD:PATH:TIMESTAMP:NONCE:BODY_HASH
  // For backward compatibility, omit nonce if not provided
  const message = nonce
    ? `${method}:${path}:${timestamp}:${nonce}:${bodyHash}`
    : `${method}:${path}:${timestamp}:${bodyHash}`;

  return new TextEncoder().encode(message);
}

/**
 * Decode base64 signature to Uint8Array
 */
function decodeSignature(signatureBase64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(signatureBase64, "base64"));
}

/**
 * Auth middleware that validates DID signatures
 *
 * Required headers:
 * - x-did: The agent's DID
 * - x-signature: Ed25519 signature (base64)
 * - x-timestamp: Unix timestamp in milliseconds
 * Optional headers (grace period):
 * - x-nonce: Unique nonce for replay protection (will be required in future)
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { did, signature, timestamp, nonce } = extractAuthHeaders(req);

  // All auth headers required (nonce is optional during grace period)
  if (!did || !signature || !timestamp) {
    res.status(401).json({
      error: {
        code: "AUTH_MISSING_HEADERS",
        message: "Missing required authentication headers: x-did, x-signature, x-timestamp",
      },
    });
    return;
  }

  // Validate timestamp is recent (within 5 minutes)
  if (!validateTimestamp(timestamp)) {
    res.status(401).json({
      error: {
        code: "AUTH_TIMESTAMP_INVALID",
        message: "Timestamp is invalid or outside acceptable range (±5 minutes)",
      },
    });
    return;
  }

  // Validate nonce if provided (optional during grace period)
  if (nonce) {
    if (!validateNonceFormat(nonce)) {
      res.status(401).json({
        error: {
          code: "AUTH_INVALID_NONCE",
          message: "Nonce must be a UUIDv4 or 16-64 character alphanumeric string",
        },
      });
      return;
    }

    // Check for replay attack
    if (!checkAndStoreNonce(did, nonce)) {
      res.status(401).json({
        error: {
          code: "AUTH_REPLAY_DETECTED",
          message: "Request replay detected. Each request must use a unique nonce.",
        },
      });
      return;
    }
  } else {
    // Grace period: log warning but allow requests without nonce
    console.warn(`[Auth] Request from ${did} without nonce - replay protection disabled (grace period)`);
  }

  // Verify DID format
  if (!did.startsWith("did:key:z6Mk")) {
    res.status(401).json({
      error: {
        code: "AUTH_INVALID_DID",
        message: "Invalid DID format. Expected did:key with Ed25519 key",
      },
    });
    return;
  }

  // Check agent exists
  const agent = getAgent(did);
  if (!agent) {
    res.status(401).json({
      error: {
        code: "AUTH_AGENT_NOT_FOUND",
        message: "Agent not registered",
      },
    });
    return;
  }

  // Build and verify signature (include nonce if provided)
  const message = buildSignedMessage(req, timestamp, nonce);

  try {
    const signatureBytes = decodeSignature(signature);
    const isValid = await verifyDIDSignature(did, message, signatureBytes);
    if (!isValid) {
      res.status(401).json({
        error: {
          code: "AUTH_SIGNATURE_INVALID",
          message: "Signature verification failed",
        },
      });
      return;
    }
  } catch {
    res.status(401).json({
      error: {
        code: "AUTH_VERIFICATION_ERROR",
        message: "Error verifying signature",
      },
    });
    return;
  }

  // Set authenticated DID on request
  req.authenticatedDid = did;
  next();
}

/**
 * Optional auth middleware - sets DID if present, but doesn't require it
 */
export async function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const { did, signature, timestamp, nonce } = extractAuthHeaders(req);

  // If no auth headers, continue without authentication
  if (!did || !signature || !timestamp) {
    next();
    return;
  }

  // If all headers present, validate them
  if (!validateTimestamp(timestamp)) {
    next();
    return;
  }

  // Validate nonce if provided (optional during grace period)
  if (nonce) {
    if (!validateNonceFormat(nonce)) {
      next();
      return;
    }

    // Check for replay attack - silently skip auth if replay detected
    if (!checkAndStoreNonce(did, nonce)) {
      next();
      return;
    }
  }

  if (!did.startsWith("did:key:z6Mk")) {
    next();
    return;
  }

  const agent = getAgent(did);
  if (!agent) {
    next();
    return;
  }

  const message = buildSignedMessage(req, timestamp, nonce);

  try {
    const signatureBytes = decodeSignature(signature);
    const isValid = await verifyDIDSignature(did, message, signatureBytes);
    if (isValid) {
      req.authenticatedDid = did;
    }
  } catch {
    // Silently continue without auth if verification fails
  }

  next();
}
