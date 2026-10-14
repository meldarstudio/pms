import type { QueryClient } from "@tanstack/react-query"
import type { ReservationDetail } from "./api.ts"

export async function refreshWorkflowQueries(
  client: QueryClient,
  saved: ReservationDetail
) {
  client.setQueryData(["reservation", saved.id], saved)
  await Promise.all([
    ...["reservations", "availability", "inventory", "payments"].map((key) =>
      client.invalidateQueries({ queryKey: [key] })
    ),
    client.invalidateQueries({
      queryKey: ["workflow-edit-preview", saved.id],
    }),
  ])
}
