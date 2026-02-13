/**
 * Time utilities for Lattice Protocol
 */

/**
 * Returns current Unix timestamp in seconds
 * @returns Current time as Unix timestamp (seconds)
 */
export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Checks if a timestamp is within a specified time window from now
 * Used for anti-replay protection in signature validation
 *
 * @param timestamp - Unix timestamp in seconds to check
 * @param windowMs - Maximum allowed age in milliseconds
 * @returns true if timestamp is within the window, false otherwise
 */
export function isWithinWindow(timestamp: number, windowMs: number): boolean {
  const currentTimeMs = Date.now();
  const timestampMs = timestamp * 1000;
  const age = currentTimeMs - timestampMs;

  // Check if timestamp is not in the future (with small tolerance for clock skew)
  // and not older than the window
  const clockSkewToleranceMs = 5000; // 5 seconds tolerance for clock skew
  return age >= -clockSkewToleranceMs && age <= windowMs;
}

/**
 * Converts seconds to milliseconds
 * @param seconds - Time in seconds
 * @returns Time in milliseconds
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

/**
 * Converts milliseconds to seconds
 * @param ms - Time in milliseconds
 * @returns Time in seconds (floored)
 */
export function msToSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}
