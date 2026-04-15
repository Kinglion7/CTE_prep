import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Project Pages set base to "/your-repo-name/" via env when building.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
});
