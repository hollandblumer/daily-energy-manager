import { defineConfig } from "vite";
import react from "@vitejs/react-swc";

export default defineConfig({
  plugins: [react()],
  // MAKE SURE THIS IS HERE:
  base: "/daily-energy-manager/",
});
