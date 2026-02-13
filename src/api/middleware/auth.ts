/**
 * DID Auth Middleware
 * Verifies Ed25519 signatures for authenticated requests
 */

import type { Request, Response, NextFunction } from "express";
import { verifyDIDSignature } from "../../modules/identity/did-service.js";
import { getAgent } from "../../modules/identity/repository.js";

/**
 * Maximum allowed timestamp drift in milliseconds (5 minutes)
 */
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

/**
 * Extend Express Request to include authenticated DID
 */
declare global {
  namespace Express {
    interface Request {
      authenticatedDid?: string;
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
} {
  return {
    did: (req.headers["x-did"] as string | undefined) || null,
    signature: (req.headers["x-signature"] as string | undefined) || null,
    timestamp: (req.headers["x-timestamp"] as string | undefined) || null,
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
 * Build message to verify from request
 * Format: METHOD:PATH:TIMESTAMP:BODY_HASH
 */
function buildSignedMessage(req: Request, timestamp: string): Uint8Array {
  const method = req.method;
  const path = req.originalUrl;
  const bodyHash = req.body ? JSON.stringify(req.body) : "";
  const message = `${method}:${path}:${timestamp}:${bodyHash}`;
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
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { did, signature, timestamp } = extractAuthHeaders(req);

  // All auth headers required
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

  // Build and verify signature
  const message = buildSignedMessage(req, timestamp);

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
  const { did, signature, timestamp } = extractAuthHeaders(req);

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

  if (!did.startsWith("did:key:z6Mk")) {
    next();
    return;
  }

  const agent = getAgent(did);
  if (!agent) {
    next();
    return;
  }

  const message = buildSignedMessage(req, timestamp);

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
