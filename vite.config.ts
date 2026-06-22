import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// Build identity, injected so the app can show what's deployed (helps confirm a
// fresh deploy vs. a cached one). Prefer the CI commit SHA; fall back to git.
function gitSha(): string {
  try {
    return (
      process.env.GITHUB_SHA?.slice(0, 7) ||
      execSync("git rev-parse --short HEAD").toString().trim()
    );
  } catch {
    return "dev";
  }
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const buildStamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(
  now.getUTCDate()
)} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;

// On GitHub Pages the app is served from /org-designer/ (the repo name), so the
// production build needs that base path. Dev/preview stay at root for simplicity.
// If you later attach a custom domain (e.g. org.ybloc.com), change base back to "/".
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/org-designer/" : "/",
  server: { port: 5180 },
  define: {
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
}));
