/**
 * Health Check Handler
 * GET /api/v1/health
 */

import type { Request, Response } from "express";
import { getDatabase } from "../../db/index.js";

/**
 * Health check response
 */
interface HealthResponse {
  status: "ok" | "degraded" | "error";
  timestamp: string;
  database: "connected" | "disconnected";
  version: string;
}

/**
 * Get health status
 */
export function getHealth(_req: Request, res: Response): void {
  const timestamp = new Date().toISOString();
  let dbStatus: "connected" | "disconnected" = "disconnected";

  try {
    const db = getDatabase();
    // Simple query to check database connection
    db.prepare("SELECT 1").get();
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  const response: HealthResponse = {
    status: dbStatus === "connected" ? "ok" : "degraded",
    timestamp,
    database: dbStatus,
    version: "1.0.0",
  };

  const statusCode = response.status === "ok" ? 200 : 503;
  res.status(statusCode).json(response);
}
