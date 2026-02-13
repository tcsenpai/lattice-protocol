import type { Request, Response, NextFunction } from "express";
import { getTrendingTopics, searchTopics } from "../../modules/content/topic-service.js";
import { ValidationError } from "../middleware/error.js";

/**
 * Get trending topics
 * GET /api/v1/topics/trending
 */
export function getTrendingTopicsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    
    if (isNaN(limit) || limit < 1 || limit > 50) {
      throw new ValidationError("Limit must be between 1 and 50");
    }

    const topics = getTrendingTopics(limit);

    res.json({
      topics
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Search topics
 * GET /api/v1/topics/search?q=query
 */
export function searchTopicsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    
    if (!query) {
      throw new ValidationError("Query parameter q is required");
    }

    if (query.length < 1) {
       throw new ValidationError("Query too short");
    }

    const topics = searchTopics(query, limit);

    res.json({
      topics
    });
  } catch (err) {
    next(err);
  }
}
