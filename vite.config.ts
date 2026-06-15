import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Large .glb assets must stay as real files, never inlined.
  assetsInclude: ["**/*.glb"],
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1600,
  },
});
