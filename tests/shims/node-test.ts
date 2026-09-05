// Maps `import test from "node:test"` onto Jest's global `test`, so the suite
// runs under both runners without a line of it changing. The files only ever
// call test(name, fn) — no subtests, hooks, describe blocks or mocks — which
// is what makes a one-line shim sufficient.
export default globalThis.test
