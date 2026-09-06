import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { handle } from "@/lib/api-response"

/**
 * Serves the hand-written OpenAPI spec (docs/openapi.yaml) as-is.
 *
 * Reading a file off disk makes this route dynamic, so an edit to the spec
 * shows up without a rebuild. `/api/docs` points Swagger UI here.
 */
export const GET = handle("Failed to read the OpenAPI spec", async () => {
  const spec = await readFile(join(process.cwd(), "docs", "openapi.yaml"), "utf8")
  return new Response(spec, {
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "cache-control": "no-store",
    },
  })
})
