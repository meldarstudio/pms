import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    name: "backend",
    environment: "node",
    include: ["src/**/*.test.{ts,mjs}"],
  },
});
