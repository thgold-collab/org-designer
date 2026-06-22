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

// Served at the root of the custom domain https://org.ybloc.us (see public/CNAME),
// so base is "/". The old github.io/org-designer/ URL now redirects to the domain.
export default defineConfig(() => ({
  plugins: [react()],
  base: "/",
  server: { port: 5180 },
  define: {
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
}));
