import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative assets work on both a custom domain and a GitHub project page.
  base: "./",
  build: {
    sourcemap: true,
  },
});
