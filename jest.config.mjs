/**
 * Jest over a suite originally written for `node --test`.
 *
 * Two things make this repo awkward for Jest, both handled in moduleNameMapper:
 *   - the tests import node:test / node:assert/strict, which register with
 *     Node's runner rather than Jest's, so both are mapped to shims;
 *   - every source import carries an explicit .ts extension
 *     (allowImportingTsExtensions), which Jest's resolver rejects.
 *
 * package.json is "type": "module", so Jest needs --experimental-vm-modules;
 * the npm scripts pass it.
 */
const config = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  moduleNameMapper: {
    "^node:test$": "<rootDir>/tests/shims/node-test.ts",
    "^node:assert/strict$": "<rootDir>/tests/shims/node-assert.ts",
    "^(\\.{1,2}/.*)\\.ts$": "$1",
  },
}

export default config
