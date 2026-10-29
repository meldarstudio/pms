import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error.ts";

export function retryRead(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryRead } },
});
