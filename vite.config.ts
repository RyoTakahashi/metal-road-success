import { defineConfig } from "vite";

// Prototype config. base "./" keeps the built site portable (open anywhere).
export default defineConfig({
  base: "./",
  server: { port: 5173, open: false },
});
