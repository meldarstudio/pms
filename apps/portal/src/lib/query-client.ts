import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error.ts";

/** Client errors such as 404 will not change on retry; connection and server failures might. */
export function retryRead(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryRead } },
});
