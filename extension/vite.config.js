import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from "fs";
import { join, basename } from "path";

// Plugin to flatten HTML files from dist/src/*/name.html to dist/name.html
// and fix relative paths (../../ -> ./)
function flattenHtml() {
  return {
    name: "flatten-html",
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      const srcDir = join(distDir, "src");
      try {
        flattenDir(srcDir, distDir);
        rmDir(srcDir);
      } catch {}
    },
  };
}

function flattenDir(dir, dest) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      flattenDir(full, dest);
    } else if (entry.endsWith(".html")) {
      let content = readFileSync(full, "utf-8");
      // Fix relative paths: ../../ -> ./ (HTML was nested 2 levels deep)
      content = content.replace(/(?:\.\.\/)+/g, "./");
      // Remove crossorigin (can affect permissions in extensions)
      content = content.replace(/ crossorigin/g, "");
      writeFileSync(join(dest, basename(full)), content);
    }
  }
}

function rmDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) rmDir(full);
    else unlinkSync(full);
  }
  rmdirSync(dir);
}

export default defineConfig({
  plugins: [tailwindcss(), flattenHtml()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
        sidepanel: resolve(__dirname, "src/sidepanel/sidepanel.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.js"),
        offscreen: resolve(__dirname, "src/offscreen/offscreen.html"),
        "mic-permission": resolve(__dirname, "src/permissions/mic-permission.html"),
        "mic-permission-script": resolve(__dirname, "src/permissions/mic-permission.js"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
