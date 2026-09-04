import { NextResponse } from "next/server"

/**
 * One response shape for every route handler.
 *
 * Before this, each of the eight routes hand-rolled its own try/catch and its
 * own error body. They mostly agreed — `{ error: string }` with a 500 — but not
 * entirely, and the client has no way to tell the variants apart.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(message: string, status = 500, cause?: unknown) {
  if (cause) console.error("[api]", message, cause)
  return NextResponse.json({ error: message }, { status })
}

/**
 * Wrap a handler so a thrown error becomes a 500 with the error's own message,
 * which is what every route was already doing by hand.
 */
export function handle<A extends unknown[]>(
  label: string,
  handler: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (error) {
      return fail(
        error instanceof Error ? error.message : "Internal Server Error",
        500,
        `${label}:`,
      )
    }
  }
}

/** A 400 for a request the client got wrong. */
export function badRequest(message: string) {
  return fail(message, 400)
}

/** A 404 for a row that is not there. */
export function notFound(message: string) {
  return fail(message, 404)
}
