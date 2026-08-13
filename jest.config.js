/**
 * Native ESM, no Babel: this project runs on Node's own ES module support
 * (`"type": "module"` in package.json), and Jest's experimental VM-modules
 * mode (enabled via NODE_OPTIONS in package.json's test script) understands
 * that directly. Adding Babel just to make Jest happy would mean tests run
 * through a transform the actual app never goes through — a gap between
 * what's tested and what ships.
 */
export default {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  verbose: true,
  // Integration/API tests share one real Postgres test database — running
  // serially avoids cross-test data races on shared tables, at the cost of
  // total run time. Acceptable for this project's test volume.
  maxWorkers: 1,
};
