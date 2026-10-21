import type { QueryClient } from "@tanstack/react-query";
import type { ReservationDetail } from "./api.ts";

export const workflowMutationKey = (id: string | null) => ["workflow-command", id] as const;

export function isReservationSaving(client: QueryClient, id: string | null) {
  return client.isMutating({ mutationKey: workflowMutationKey(id) }) > 0;
}

export async function refreshWorkflowQueries(client: QueryClient, saved: ReservationDetail) {
  client.setQueryData(["reservation", saved.id], saved);
  await Promise.all([
    ...["reservations", "availability", "inventory", "payments", "calendar"].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
    client.invalidateQueries({
      queryKey: ["workflow-edit-preview", saved.id],
    }),
  ]);
}
