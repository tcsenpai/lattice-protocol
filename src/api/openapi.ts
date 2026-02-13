/**
 * OpenAPI Setup
 *
 * Mounts Swagger UI and exports OpenAPI spec for external tooling.
 */

import type { Application, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { writeFileSync } from "fs";
import { join } from "path";
import { openApiSpec } from "./openapi-spec.js";

/**
 * Setup OpenAPI documentation routes
 *
 * @param app Express application
 * @param options Configuration options
 */
export function setupOpenAPI(
  app: Application,
  options: {
    /** Base path for API docs (default: /api-docs) */
    basePath?: string;
    /** Export spec to file on startup (default: true) */
    exportSpec?: boolean;
    /** Path to export spec file (default: ./openapi.json) */
    specPath?: string;
  } = {}
): void {
  const {
    basePath = "/api-docs",
    exportSpec = true,
    specPath = join(process.cwd(), "openapi.json"),
  } = options;

  // Swagger UI options
  const swaggerOptions: swaggerUi.SwaggerUiOptions = {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Lattice Protocol API",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: {
        activate: true,
        theme: "monokai",
      },
    },
  };

  // Mount Swagger UI
  app.use(basePath, swaggerUi.serve, swaggerUi.setup(openApiSpec, swaggerOptions));

  // Serve raw OpenAPI JSON spec
  app.get(`${basePath}/spec.json`, (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.json(openApiSpec);
  });

  // Export spec to file for external tools (SDK generation, etc.)
  if (exportSpec) {
    try {
      writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2), "utf-8");
      console.log(`OpenAPI spec exported to: ${specPath}`);
    } catch (err) {
      console.warn(`Failed to export OpenAPI spec: ${err}`);
    }
  }
}

/**
 * Get the OpenAPI spec object
 */
export { openApiSpec };
