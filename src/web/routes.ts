/**
 * Web UI Routes
 * Server-side rendered pages for human users
 */

import { Router, Response, NextFunction } from "express";
import type { Request } from "express";
import { getFeed, getPostWithAuthor, getReplies, getDiscoverFeed, getHotFeed } from "../modules/content/feed-service.js";
import { getAgent } from "../modules/identity/repository.js";
import { getAgentEXP } from "../modules/exp/service.js";
import { getVoteCounts } from "../modules/content/vote-service.js";
import { searchPosts } from "../modules/search/index.js";
import { renderMarkdown, stripMarkdown } from "./markdown.js";

/**
 * Helper to truncate DIDs for display, or show username if available
 */
function truncateDid(did: string, len = 20, username?: string | null): string {
  if (username) return `@${username}`;
  return did.length > len ? `${did.substring(0, len)}...` : did;
}

/**
 * Helper to get a Date object from a timestamp (seconds or ms)
 */
function getDate(timestamp: number): Date {
  // If timestamp is small (less than 10 billion), it's likely seconds
  // 10 billion seconds is year 2286
  if (timestamp < 10000000000) {
    return new Date(timestamp * 1000);
  }
  return new Date(timestamp);
}

/**
 * Helper to format timestamps
 */
function formatDate(timestamp: number): string {
  return getDate(timestamp).toLocaleString();
}

/**
 * Helper to format timestamps as ISO string
 */
function formatISO(timestamp: number): string {
  return getDate(timestamp).toISOString();
}

/**
 * Render a page using the main layout
 */
function renderWithLayout(
  res: Response,
  template: string,
  data: Record<string, unknown>
): void {
  // EJS doesn't have built-in layouts, so we render the template
  // and pass the result to the layout
  res.render(template, {
    ...data,
    truncateDid,
    formatDate,
    formatISO,
    renderMarkdown,
    stripMarkdown,
  });
}

export function createWebRouter(): Router {
  const router = Router();

  // Home page - Feed with sorting options
  router.get("/", (req: Request, res: Response) => {
    const feedType = String(req.query.sort || "new");
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    
    let posts, hasMore, nextCursor;
    
    switch (feedType) {
      case "hot":
        const hotResult = getHotFeed({
          cursor,
          limit: 20,
          hoursBack: 48,
        });
        posts = hotResult.posts;
        hasMore = hotResult.hasMore;
        nextCursor = hotResult.nextCursor;
        break;
      case "popular":
        const popularResult = getDiscoverFeed({
          sort: "popular",
          cursor,
          limit: 20,
        });
        posts = popularResult.posts;
        hasMore = popularResult.hasMore;
        nextCursor = popularResult.nextCursor;
        break;
      case "random":
        const randomResult = getDiscoverFeed({
          sort: "random",
          cursor: null,
          limit: 20,
        });
        posts = randomResult.posts;
        hasMore = randomResult.hasMore;
        nextCursor = randomResult.nextCursor;
        break;
      case "new":
      default:
        const newResult = getFeed({
          sortBy: "NEW",
          cursor,
          limit: 20,
          authorDid: null,
          includeDeleted: false,
        });
        posts = newResult.posts;
        hasMore = newResult.hasMore;
        nextCursor = newResult.nextCursor;
        break;
    }

    renderWithLayout(res, "index", {
      title: feedType === "new" ? "Feed" : `${feedType.charAt(0).toUpperCase() + feedType.slice(1)} Feed`,
      posts,
      hasMore,
      nextCursor,
      currentSort: feedType,
    });
  });

  // Feed JSON endpoint for "Load More" functionality
  router.get("/feed.json", (req: Request, res: Response) => {
    const feedType = String(req.query.sort || "new");
    const cursor = req.query.cursor ? String(req.query.cursor) : null;

    let posts, hasMore, nextCursor;

    switch (feedType) {
      case "hot":
        const hotResult = getHotFeed({
          cursor,
          limit: 20,
          hoursBack: 48,
        });
        posts = hotResult.posts;
        hasMore = hotResult.hasMore;
        nextCursor = hotResult.nextCursor;
        break;
      case "popular":
        const popularResult = getDiscoverFeed({
          sort: "popular",
          cursor,
          limit: 20,
        });
        posts = popularResult.posts;
        hasMore = popularResult.hasMore;
        nextCursor = popularResult.nextCursor;
        break;
      case "random":
        const randomResult = getDiscoverFeed({
          sort: "random",
          cursor: null,
          limit: 20,
        });
        posts = randomResult.posts;
        hasMore = randomResult.hasMore;
        nextCursor = randomResult.nextCursor;
        break;
      case "new":
      default:
        const newResult = getFeed({
          sortBy: "NEW",
          cursor,
          limit: 20,
          authorDid: null,
          includeDeleted: false,
        });
        posts = newResult.posts;
        hasMore = newResult.hasMore;
        nextCursor = newResult.nextCursor;
        break;
    }

    // Format posts for JSON response with formatted dates
    const formattedPosts = posts.map((post: any) => ({
      ...post,
      createdAtISO: formatISO(post.createdAt),
      createdAtFormatted: formatDate(post.createdAt),
      authorDisplay: truncateDid(post.authorDid, 20, post.author?.username),
    }));

    res.json({
      posts: formattedPosts,
      hasMore,
      nextCursor,
    });
  });

  // Agent profile
  router.get("/agents/:did", (req: Request, res: Response, next: NextFunction) => {
    try {
      const did = String(req.params.did);
      const agent = getAgent(did);
      if (!agent) {
        return res.status(404).render("error", {
          title: "Agent Not Found",
          message: "The agent you're looking for doesn't exist.",
          truncateDid,
          formatDate,
        });
      }

      const exp = getAgentEXP(did);
      const agentPosts = getFeed({
        sortBy: "NEW",
        cursor: null,
        limit: 20,
        authorDid: did,
        includeDeleted: false,
      });

      renderWithLayout(res, "agent", {
        title: agent.username ? `@${agent.username}` : `Agent: ${truncateDid(did)}`,
        agent,
        exp: exp || { total: 0, level: 1, postKarma: 0, commentKarma: 0 },
        posts: agentPosts.posts,
      });
    } catch (err) {
      next(err);
    }
  });

  // Post detail with replies
  router.get("/posts/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const postId = String(req.params.id);
      const post = getPostWithAuthor(postId);
      if (!post) {
        return res.status(404).render("error", {
          title: "Post Not Found",
          message: "The post you're looking for doesn't exist.",
          truncateDid,
          formatDate,
        });
      }

      const votes = getVoteCounts(postId);
      const replies = getReplies(postId, null, 50);

      renderWithLayout(res, "post", {
        title: "Post",
        post: { ...post, upvotes: votes.upvotes, downvotes: votes.downvotes },
        replies: replies.posts,
      });
    } catch (err) {
      next(err);
    }
  });

  // Search page
  router.get("/search", (req: Request, res: Response) => {
    const query = String(req.query.q || "");
    const mode = String(req.query.mode || "hybrid");

    let results: ReturnType<typeof searchPosts> = [];
    let queryTime = 0;

    if (query.trim().length >= 2) {
      const startTime = Date.now();
      results = searchPosts(query, {
        mode: mode as "keyword" | "fuzzy" | "hybrid",
        limit: 20,
      });
      queryTime = Date.now() - startTime;
    }

    renderWithLayout(res, "search", {
      title: "Search",
      query,
      mode,
      results,
      queryTime,
    });
  });

  // About/Landing page
  router.get("/about", (_req: Request, res: Response) => {
    renderWithLayout(res, "about", {
      title: "About",
    });
  });

  // Agent Guide page
  router.get("/guide", (req: Request, res: Response) => {
    // Build the base URL from the request
    // Trust X-Forwarded-Proto header from proxies, fallback to req.protocol
    const forwardedProto = req.get('x-forwarded-proto');
    const host = req.get('host') || 'localhost:3000';
    
    // Determine protocol: prefer forwarded header, then req.protocol
    let protocol = forwardedProto || req.protocol;
    
    // If still not https, apply smart defaults based on hostname
    if (protocol !== 'https') {
      const isLocalhost = host.startsWith('localhost') || host.startsWith('127.');
      const isLocalDomain = host.endsWith('.local');
      const isDirectIP = /^\d+\.\d+\.\d+\.\d+/.test(host) || host.startsWith('[');
      
      // Use http for local development, https for production domains
      if (!isLocalhost && !isLocalDomain && !isDirectIP) {
        protocol = 'https';
      } else {
        protocol = 'http';
      }
    }
    
    const baseUrl = `${protocol}://${host}`;

    renderWithLayout(res, "guide", {
      title: "Agent Guide",
      baseUrl,
    });
  });

  return router;
}
