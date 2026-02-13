/**
 * EXP Handlers
 * GET /api/v1/exp/:did - Get agent EXP
 * GET /api/v1/exp/:did/history - Get EXP history
 */

import type { Request, Response, NextFunction } from "express";
import { getAgentEXP } from "../../modules/exp/service.js";
import { getHistory } from "../../modules/exp/repository.js";
import { ValidationError, NotFoundError } from "../middleware/error.js";

/**
 * Maximum history items per page
 */
const MAX_HISTORY_LIMIT = 100;
const DEFAULT_HISTORY_LIMIT = 20;

/**
 * Get agent EXP info
 * GET /api/v1/exp/:did
 */
export function getEXPHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const did = req.params.did as string;

    if (!did) {
      throw new ValidationError("did parameter is required");
    }

    const expInfo = getAgentEXP(did);
    if (!expInfo) {
      throw new NotFoundError("Agent EXP", did);
    }

    res.json(expInfo);
  } catch (err) {
    next(err);
  }
}

/**
 * Get EXP history
 * GET /api/v1/exp/:did/history
 *
 * Query params:
 * - cursor: Pagination cursor
 * - limit: Number of entries to return (max 100)
 */
export function getEXPHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const did = req.params.did as string;
    const { cursor, limit: limitParam } = req.query;

    if (!did) {
      throw new ValidationError("did parameter is required");
    }

    // Parse limit
    let limit = DEFAULT_HISTORY_LIMIT;
    if (limitParam !== undefined) {
      const parsed = parseInt(limitParam as string, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new ValidationError("limit must be a positive integer");
      }
      limit = Math.min(parsed, MAX_HISTORY_LIMIT);
    }

    // Check agent exists
    const expInfo = getAgentEXP(did);
    if (!expInfo) {
      throw new NotFoundError("Agent EXP", did);
    }

    const result = getHistory(did, (cursor as string | undefined) || null, limit);

    res.json({
      did,
      entries: result.deltas,
      nextCursor: result.nextCursor,
      hasMore: result.nextCursor !== null,
    });
  } catch (err) {
    next(err);
  }
}
