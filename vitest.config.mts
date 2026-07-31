import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Node environment is enough — nothing here renders React components;
// these tests exercise API route handlers and lib/ logic directly.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", "**/tests/e2e/**", "**/tests/synthetic/**"],
  },
});
