import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite"

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_")
  if (command === "build" && !env.VITE_API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is required to build the portal.")
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(import.meta.dirname, "./src"),
      },
    },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(import.meta.dirname)],
      },
    },
  }
})
