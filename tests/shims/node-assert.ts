// Maps `import assert from "node:assert/strict"` onto Jest matchers.
//
// The suite uses exactly four methods (equal 177, match 16, ok 14,
// deepEqual 13). If a fifth ever appears the import fails loudly here rather
// than silently asserting nothing, which is why this is not a Proxy.
//
// assert/strict's `equal` is ===, and `toBe` is Object.is; they differ only on
// NaN and -0, neither of which this suite asserts on.

/**
 * node:assert takes an optional trailing message that Jest has no matcher
 * equivalent for, so it is prepended to the failure instead of dropped.
 */
function withMessage(message: string | undefined, run: () => void) {
  if (message === undefined) return run()
  try {
    run()
  } catch (error) {
    const failure = error as Error
    failure.message = `${message}\n\n${failure.message}`
    throw failure
  }
}

const assert = (value: unknown, message?: string) =>
  withMessage(message, () => expect(value).toBeTruthy())

assert.ok = (value: unknown, message?: string) =>
  withMessage(message, () => expect(value).toBeTruthy())

assert.equal = (actual: unknown, expected: unknown, message?: string) =>
  withMessage(message, () => expect(actual).toBe(expected))

assert.deepEqual = (actual: unknown, expected: unknown, message?: string) =>
  withMessage(message, () => expect(actual).toEqual(expected))

assert.match = (value: string, pattern: RegExp, message?: string) =>
  withMessage(message, () => expect(value).toMatch(pattern))

export default assert
