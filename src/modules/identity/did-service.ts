/**
 * DID Service - did:key method implementation with Ed25519 support
 *
 * Implements W3C DID Core v1.0 compatible did:key identifiers.
 *
 * did:key method encoding:
 * - Prefix: `did:key:z`
 * - The `z` indicates multibase base58btc encoding
 * - For Ed25519 keys, the multicodec prefix is 0xed01 (2 bytes)
 * - Format: `did:key:z` + base58btc(0xed01 + publicKeyBytes)
 */

import { webcrypto } from "node:crypto";
// Polyfill globalThis.crypto for @noble/ed25519 (needed in older Node.js versions)
if (!globalThis.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).crypto = webcrypto;
}

import * as ed25519 from "@noble/ed25519";
import { base58btc } from "multiformats/bases/base58";

// Ed25519 multicodec prefix (0xed01)
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01]);

// DID method prefix
const DID_KEY_PREFIX = "did:key:";

/**
 * Generate a did:key identifier from an Ed25519 public key
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @returns did:key identifier string
 * @throws Error if public key is not 32 bytes
 *
 * @example
 * ```ts
 * const publicKey = new Uint8Array(32); // your Ed25519 public key
 * const did = generateDIDKey(publicKey);
 * // => "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"
 * ```
 */
export function generateDIDKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(
      `Invalid Ed25519 public key: expected 32 bytes, got ${publicKey.length}`
    );
  }

  // Prepend multicodec prefix to public key
  const prefixedKey = new Uint8Array(
    ED25519_MULTICODEC_PREFIX.length + publicKey.length
  );
  prefixedKey.set(ED25519_MULTICODEC_PREFIX);
  prefixedKey.set(publicKey, ED25519_MULTICODEC_PREFIX.length);

  // Encode as multibase base58btc (prefix 'z')
  const encoded = base58btc.encode(prefixedKey);

  return `${DID_KEY_PREFIX}${encoded}`;
}

/**
 * Extract the Ed25519 public key from a did:key identifier
 *
 * @param did - did:key identifier string
 * @returns 32-byte Ed25519 public key
 * @throws Error if DID format is invalid
 *
 * @example
 * ```ts
 * const publicKey = extractPublicKey("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK");
 * // => Uint8Array(32)
 * ```
 */
export function extractPublicKey(did: string): Uint8Array {
  if (!did.startsWith(DID_KEY_PREFIX)) {
    throw new Error(`Invalid DID: must start with "${DID_KEY_PREFIX}"`);
  }

  const multibaseKey = did.slice(DID_KEY_PREFIX.length);

  // Multibase base58btc strings start with 'z'
  if (!multibaseKey.startsWith("z")) {
    throw new Error(
      'Invalid did:key format: multibase key must start with "z" (base58btc)'
    );
  }

  let decoded: Uint8Array;
  try {
    decoded = base58btc.decode(multibaseKey);
  } catch (e) {
    throw new Error(`Invalid did:key: failed to decode base58btc: ${e}`);
  }

  // Check multicodec prefix (0xed01 for Ed25519)
  if (
    decoded.length < 2 ||
    decoded[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    decoded[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error("Invalid did:key: not an Ed25519 key (wrong multicodec)");
  }

  // Remove multicodec prefix (2 bytes)
  const publicKey = decoded.slice(2);

  if (publicKey.length !== 32) {
    throw new Error(
      `Invalid Ed25519 public key in DID: expected 32 bytes, got ${publicKey.length}`
    );
  }

  return publicKey;
}

/**
 * Verify an Ed25519 signature for a given DID
 *
 * @param did - did:key identifier of the signer
 * @param message - Original message that was signed
 * @param signature - 64-byte Ed25519 signature
 * @returns true if signature is valid, false otherwise
 *
 * @example
 * ```ts
 * const isValid = await verifyDIDSignature(
 *   "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
 *   new TextEncoder().encode("Hello, World!"),
 *   signatureBytes
 * );
 * ```
 */
export async function verifyDIDSignature(
  did: string,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  try {
    const publicKey = extractPublicKey(did);
    return await ed25519.verifyAsync(signature, message, publicKey);
  } catch {
    // Invalid DID or signature format
    return false;
  }
}

/**
 * Generate a new Ed25519 keypair with corresponding DID
 *
 * Convenience function for testing and agent creation.
 *
 * @returns Object containing privateKey, publicKey, and did
 *
 * @example
 * ```ts
 * const { privateKey, publicKey, did } = await generateKeyPair();
 * // privateKey: Uint8Array(32) - secret key
 * // publicKey: Uint8Array(32) - public key
 * // did: "did:key:z6Mk..." - DID identifier
 * ```
 */
export async function generateKeyPair(): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  did: string;
}> {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  const did = generateDIDKey(publicKey);

  return { privateKey, publicKey, did };
}

/**
 * Sign a message with an Ed25519 private key
 *
 * Convenience function for testing and request signing.
 *
 * @param privateKey - 32-byte Ed25519 private key
 * @param message - Message to sign
 * @returns 64-byte Ed25519 signature
 *
 * @example
 * ```ts
 * const signature = await signMessage(privateKey, new TextEncoder().encode("Hello"));
 * ```
 */
export async function signMessage(
  privateKey: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  return await ed25519.signAsync(message, privateKey);
}

/**
 * Validate that a string is a properly formatted did:key identifier
 *
 * @param did - String to validate
 * @returns true if valid did:key format
 *
 * @example
 * ```ts
 * isValidDIDKey("did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"); // true
 * isValidDIDKey("did:web:example.com"); // false
 * isValidDIDKey("invalid"); // false
 * ```
 */
export function isValidDIDKey(did: string): boolean {
  try {
    extractPublicKey(did);
    return true;
  } catch {
    return false;
  }
}
