import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./index.css";
import { AuthGate } from "@/components/auth-gate";
import { PwaStatus } from "@/components/pwa-status";
import { ThemeProvider } from "@/components/theme-provider.tsx";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PwaStatus>
          <TooltipProvider>
            <AuthGate>
              <RouterProvider router={router} />
            </AuthGate>
          </TooltipProvider>
          <Toaster />
        </PwaStatus>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
