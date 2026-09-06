import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { getAbsoluteFSPath } from "swagger-ui-dist"
import { handle, notFound } from "@/lib/api-response"

/**
 * Swagger UI for docs/openapi.yaml, served from the bundled `swagger-ui-dist`
 * package rather than a CDN so it works offline and moves with the lockfile.
 *
 * The optional catch-all handles both the page (`/api/docs`) and its two static
 * assets (`/api/docs/swagger-ui.css`, `/api/docs/swagger-ui-bundle.js`). Only
 * the allow-listed filenames are readable — the `asset` segment is never joined
 * into a path.
 */
const ASSETS: Record<string, string> = {
  "swagger-ui.css": "text/css; charset=utf-8",
  "swagger-ui-bundle.js": "text/javascript; charset=utf-8",
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Career Tracker API — Swagger UI</title>
  <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
  <style>body { margin: 0 } .topbar { display: none }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/openapi",
      dom_id: "#swagger-ui",
      deepLinking: true,
      docExpansion: "list",
      defaultModelsExpandDepth: 0,
    })
  </script>
</body>
</html>
`

type Context = { params: Promise<{ asset?: string[] }> }

export const GET = handle("Failed to serve API docs", async (_request: Request, { params }: Context) => {
  const { asset } = await params

  if (!asset || asset.length === 0) {
    return new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    })
  }

  const name = asset.length === 1 ? asset[0] : ""
  const contentType = ASSETS[name]
  if (!contentType) return notFound("Unknown docs asset")

  const body = await readFile(join(getAbsoluteFSPath(), name))
  return new Response(body, {
    headers: { "content-type": contentType, "cache-control": "public, max-age=3600" },
  })
})
