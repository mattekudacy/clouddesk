import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./*" path mapping so tests can
    // import with the same aliases the app code uses.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Worktrees (e.g. .claude/worktrees/**) live nested inside this repo on
    // disk, so without an exclude, running tests from the main checkout
    // walks into any live worktree and double-discovers the same files.
    exclude: ["**/node_modules/**", "**/.git/**", "**/.claude/**"],
  },
});
