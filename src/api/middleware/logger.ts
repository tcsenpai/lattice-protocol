/**
 * Request Logger Middleware
 * Logs incoming requests with timing, agent info, and response status
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Log entry format
 */
interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  did: string;
  status: number;
  duration: number;
  userAgent?: string;
  ip?: string;
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get status color for console output
 */
function getStatusColor(status: number): string {
  if (status >= 500) return "\x1b[31m"; // Red
  if (status >= 400) return "\x1b[33m"; // Yellow
  if (status >= 300) return "\x1b[36m"; // Cyan
  if (status >= 200) return "\x1b[32m"; // Green
  return "\x1b[37m"; // White
}

/**
 * Reset color code
 */
const RESET = "\x1b[0m";

/**
 * Format log entry as string
 */
function formatLogEntry(entry: LogEntry): string {
  const didShort = entry.did !== "anonymous" 
    ? `${entry.did.slice(0, 20)}...` 
    : entry.did;
  
  const color = getStatusColor(entry.status);
  const timestamp = entry.timestamp.split("T")[1].slice(0, 8);
  
  return `${timestamp} ${color}${entry.status}${RESET} ${entry.method.padEnd(6)} ${entry.url.padEnd(30)} ${formatDuration(entry.duration).padStart(6)} ${didShort}`;
}

/**
 * Request logger middleware
 * Logs all HTTP requests with timing and agent information
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Capture response finish event for timing
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      did: req.authenticatedDid || "anonymous",
      status: res.statusCode,
      duration,
      userAgent: req.get("user-agent"),
      ip: req.ip || req.socket.remoteAddress,
    };
    
    // Log to console
    console.log(formatLogEntry(entry));
  });
  
  next();
}

/**
 * Log important agent actions
 */
export function logAgentAction(
  action: string,
  did: string,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const didShort = `${did.slice(0, 20)}...`;
  
  console.log(`[AGENT] ${timestamp} ${action} ${didShort}${details ? " " + JSON.stringify(details) : ""}`);
}

/**
 * Log system events
 */
export function logSystem(event: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`[SYSTEM] ${timestamp} ${event}${details ? " " + JSON.stringify(details) : ""}`);
}
