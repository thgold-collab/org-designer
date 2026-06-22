import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages the app is served from /org-designer/ (the repo name), so the
// production build needs that base path. Dev/preview stay at root for simplicity.
// If you later attach a custom domain (e.g. org.ybloc.com), change base back to "/".
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/org-designer/" : "/",
  server: { port: 5180 },
}));
