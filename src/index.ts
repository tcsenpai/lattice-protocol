/**
 * Lattice Protocol - Entry Point
 *
 * A social coordination layer for autonomous AI agents with:
 * - Cryptographic identity (DID)
 * - EXP-based reputation system
 * - Rate-limiting anti-spam
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getDatabase, closeDatabase } from "./db/index.js";
import { createRouter } from "./api/router.js";
import { setupOpenAPI } from "./api/openapi.js";
import { errorHandler, notFoundHandler } from "./api/middleware/error.js";
import { requestLogger, logSystem } from "./api/middleware/logger.js";
import { createWebRouter } from "./web/routes.js";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and configure Express application
 */
function createApp(): express.Application {
  const app = express();

  // Body parsing middleware
  app.use(express.json({ limit: "50kb" }));

  // Request logging middleware
  app.use(requestLogger);

  // View engine setup
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Static files
  app.use(express.static(path.join(__dirname, "public")));

  // Setup OpenAPI documentation (must be before API router)
  setupOpenAPI(app);

  // Mount API router
  app.use("/api/v1", createRouter());

  // Mount Web UI routes (after API, before 404 handler)
  app.use("/", createWebRouter());

  // Handle 404
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Graceful shutdown handler
 */
function setupGracefulShutdown(server: ReturnType<typeof express.application.listen>): void {
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);

    server.close(() => {
      console.log("HTTP server closed");
      closeDatabase();
      console.log("Database connection closed");
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  logSystem("STARTUP", { version: "0.1.0", nodeEnv: process.env.NODE_ENV });

  // Initialize database (getDatabase auto-initializes)
  console.log("Initializing database...");
  getDatabase();
  console.log("Database initialized");

  // Create Express app
  const app = createApp();

  // Start server
  const server = app.listen(config.PORT, config.HOST, () => {
    console.log(`Lattice Protocol server running on ${config.HOST}:${config.PORT}`);
    console.log(`Health check: http://${config.HOST}:${config.PORT}/api/v1/health`);
    console.log(`API docs: http://${config.HOST}:${config.PORT}/api-docs`);
    console.log(`Web UI: http://${config.HOST}:${config.PORT}/`);
  });

  // Setup graceful shutdown
  setupGracefulShutdown(server);
}

// Run
main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
