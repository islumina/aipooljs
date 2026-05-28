import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      // Scaffold-stage thresholds. src/index.ts is a `throw` stub, so 0% is
      // expected and we only assert that vitest itself runs against the
      // placeholder test. Tightened to 95/90/100/100 in 0.1.0.
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    typecheck: {
      enabled: false,
    },
  },
});
