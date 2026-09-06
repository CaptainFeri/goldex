import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `globals` so specs read the same as the backend's jest suites.
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
