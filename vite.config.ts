import { defineConfig } from "vite";

// Prototype config. base "./" keeps the built site portable (open anywhere).
// EDITION env var selects the short (itch/casual, ends at Major Debut) vs long
// build: `EDITION=short vite build`. Injected as a compile-time constant.
const edition = process.env.EDITION === "short" ? "short" : "long";

export default defineConfig({
  base: "./",
  define: {
    __METAL_EDITION__: JSON.stringify(edition),
  },
  server: { port: 5173, open: false },
});
