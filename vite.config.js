import { defineConfig } from "vite";
import react from "@vitejs/plugin-react"; // Changed this line

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/daily-energy-manager/", // Ensure this matches your repo name exactly
});
