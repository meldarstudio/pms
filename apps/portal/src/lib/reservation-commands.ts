import { useCallback, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  assignRoom,
  previewWorkflow,
  sendWorkflow,
  type ReservationDetail,
  type WorkflowAction,
  type WorkflowCommand,
} from "./api.ts";
import { ApiError, serverFieldErrors, type FieldScope } from "./api-error.ts";
import type { ReservationStay } from "./assignment-availability.ts";

export type ReservationCommandResult =
  | { status: "saved"; reservation: ReservationDetail }
  | { status: "rejected"; fields: Record<string, string> }
  /** `message` is Spanish; `code` is the server's English error code, when it sent one. */
  | { status: "failed"; message: string; code?: string };

const fallbackMessage = "No se pudieron guardar los cambios.";

// Unsettled commands live in the query cache, so removing queries on sign-out or
// clearing the client forgets them. Nothing observes this entry; it never refetches.
// Clearing the cache replaces the map, so its identity also marks the signed-in session.
const unsettledKey = ["reservation-commands", "unsettled"] as const;

type UnsettledCommands = Map<string, WorkflowCommand>;

function unsettledCommands(client: QueryClient) {
  const existing = client.getQueryData<UnsettledCommands>(unsettledKey);
  if (existing) return existing;
  const created: UnsettledCommands = new Map();
  client.setQueryDefaults(unsettledKey, { gcTime: Infinity, staleTime: Infinity });
  client.setQueryData(unsettledKey, created);
  return created;
}

/** The saves to each Reservation queued or running on one QueryClient. */
type SaveQueue = {
  /** The last save queued per Reservation; the next one starts after it settles. */
  lastSave: Map<string, Promise<unknown>>;
  /** Queued or running saves by Reservation and exact actions, for joining. */
  joinable: Map<string, { session: UnsettledCommands; result: Promise<ReservationCommandResult> }>;
  saving: Map<string, number>;
  listeners: Set<() => void>;
};

const saveQueues = new WeakMap<QueryClient, SaveQueue>();

function saveQueue(client: QueryClient) {
  let queue = saveQueues.get(client);
  if (!queue) {
    queue = { lastSave: new Map(), joinable: new Map(), saving: new Map(), listeners: new Set() };
    saveQueues.set(client, queue);
  }
  return queue;
}

function changeSaving(queue: SaveQueue, id: string, delta: number) {
  const count = (queue.saving.get(id) ?? 0) + delta;
  if (count > 0) queue.saving.set(id, count);
  else queue.saving.delete(id);
  for (const listener of queue.listeners) listener();
}

// The fields a rejection may name depend on what the command changed.
const scopeByAction: Partial<Record<WorkflowAction["type"], FieldScope>> = {
  "add-payment": "payment",
  "edit-payment": "payment",
  contact: "contact",
  "set-guests": "guest",
  dates: "details",
  "add-room": "details",
  "edit-room": "details",
  "remove-room": "details",
};

function rejection(cause: unknown, actions: WorkflowAction[]): ReservationCommandResult {
  const scopes = actions.flatMap((action) => scopeByAction[action.type] ?? []);
  const fields = serverFieldErrors(cause, ...scopes);
  return fields ? { status: "rejected", fields } : failure(cause);
}

function failure(cause: unknown): ReservationCommandResult {
  const message = cause instanceof Error && cause.message ? cause.message : fallbackMessage;
  return cause instanceof ApiError
    ? { status: "failed", message, code: cause.code }
    : { status: "failed", message };
}

/** One message for a save that did not happen, for editors with no form field to show it. */
export function unsavedMessage(result: Exclude<ReservationCommandResult, { status: "saved" }>) {
  return result.status === "failed" ? result.message : Object.values(result.fields).join(" ");
}

const previewScope = "reservation-preview";

/** What distinguishes the previews of one Reservation. */
type PreviewParts =
  /** A Discount or status editor's bill after `actions`. */
  | [kind: "bill", actions: WorkflowAction[]]
  /** The Stay draft's reusable price quote for a pricing key. */
  | [kind: "billing", pricingKey: string]
  /** The Stay draft's validation and bill for its debounced command. */
  | [kind: "edit", command: WorkflowCommand, pricingKey: string];

/**
 * A cache key for a bill preview of one Reservation. Saves to that Reservation
 * refresh every preview under it.
 */
export function reservationPreviewKey(id: string, ...parts: PreviewParts) {
  return [previewScope, id, ...parts] as const;
}

// ADR 0001: a save that changes the calendar refreshes it.
async function refresh(client: QueryClient, saved: ReservationDetail, actions: WorkflowAction[]) {
  client.setQueryData(["reservation", saved.id], saved);
  // A preview still loading read the Reservation before this save; without cancelling,
  // the refresh would wait for it and show its stale bill.
  await client.cancelQueries({ queryKey: [previewScope, saved.id] });
  await Promise.all([
    ...["reservations", "availability", "inventory", "payments", "calendar"].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
    client.invalidateQueries({ queryKey: [previewScope, saved.id] }),
    // Other Reservations of the same Booking contact show its name, email and phone.
    actions.some((action) => action.type === "contact") &&
      client.invalidateQueries({
        queryKey: ["reservation"],
        predicate: ({ queryKey, state }) =>
          queryKey[1] !== saved.id &&
          ((state.data as ReservationDetail | undefined)?.guestId ?? saved.guestId) ===
            saved.guestId,
      }),
  ]);
}

// Each command reads a Reservation snapshot. Running saves to one Reservation in send
// order stops a Discount autosave undoing a Cancellation saved just before it.
// A save still queued when the cache is cleared (sign-out) does not run.
function enqueue(
  client: QueryClient,
  id: string,
  task: (session: UnsettledCommands) => Promise<ReservationCommandResult>,
): Promise<ReservationCommandResult> {
  const queue = saveQueue(client);
  const session = unsettledCommands(client);
  changeSaving(queue, id, 1);
  const result = (queue.lastSave.get(id) ?? Promise.resolve())
    .then(() => (unsettledCommands(client) === session ? task(session) : failure(null)))
    .catch(failure)
    .finally(() => changeSaving(queue, id, -1));
  queue.lastSave.set(id, result);
  void result.then(() => {
    if (queue.lastSave.get(id) === result) queue.lastSave.delete(id);
  });
  return result;
}

function save(
  client: QueryClient,
  id: string,
  actions: WorkflowAction[],
): Promise<ReservationCommandResult> {
  // Snapshot now: the editor may keep changing its values while this save waits.
  const snapshot = JSON.stringify(actions);
  const key = `${id}\n${snapshot}`;
  const queue = saveQueue(client);
  const joined = queue.joinable.get(key);
  // A save from before the cache was cleared belongs to the previous session.
  if (joined?.session === unsettledCommands(client)) return joined.result;
  const result = enqueue(client, id, async (unsettled) => {
    const command = unsettled.get(key) ?? {
      requestId: crypto.randomUUID(),
      actions: JSON.parse(snapshot) as WorkflowAction[],
    };
    let saved: ReservationDetail;
    try {
      saved = await sendWorkflow(id, command);
      unsettled.delete(key);
    } catch (cause) {
      unsettled.set(key, command);
      return rejection(cause, command.actions);
    }
    // A cache cleared while this save ran is not written back into.
    if (unsettledCommands(client) === unsettled) await refresh(client, saved, command.actions);
    return { status: "saved", reservation: saved };
  });
  queue.joinable.set(key, { session: unsettledCommands(client), result });
  void result.then(() => {
    if (queue.joinable.get(key)?.result === result) queue.joinable.delete(key);
  });
  return result;
}

/**
 * The only way editors save changes to an existing Reservation. `send` never throws;
 * `saving` is true while any save to this Reservation is running or queued.
 */
export function useReservationCommands(id: string | null) {
  const client = useQueryClient();
  const queue = saveQueue(client);
  const saving = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        queue.listeners.add(listener);
        return () => queue.listeners.delete(listener);
      },
      [queue],
    ),
    () => id !== null && queue.saving.has(id),
  );
  const send = useCallback(
    (actions: WorkflowAction[]): Promise<ReservationCommandResult> =>
      id === null ? Promise.resolve(failure(null)) : save(client, id, actions),
    [client, id],
  );
  return { send, saving };
}

/**
 * The calendar's room assignment. It waits for earlier saves to the Reservation, then
 * re-reads it so a colleague's concurrent assignment is not overwritten. Each attempt
 * builds its command from that read, so it never reuses a request ID or retry memory.
 * `saving` is true while an assignment from this hook is running.
 */
export function useRoomAssignmentCommand() {
  const client = useQueryClient();
  const [running, setRunning] = useState(0);
  const assign = useCallback(
    (target: ReservationStay, roomId: string): Promise<ReservationCommandResult> => {
      setRunning((count) => count + 1);
      return enqueue(client, target.reservationId, async (session) => {
        let saved: ReservationDetail;
        try {
          saved = await assignRoom(target, roomId);
        } catch (cause) {
          return failure(cause);
        }
        if (unsettledCommands(client) === session) await refresh(client, saved, []);
        return { status: "saved", reservation: saved };
      }).finally(() => setRunning((count) => count - 1));
    },
    [client],
  );
  return { assign, saving: running > 0 };
}

/**
 * The bill and validation issues the Reservation would have after `actions`, without
 * saving them. Debouncing input belongs to the caller; saves re-read open previews.
 */
export function useReservationPreview(id: string, actions: WorkflowAction[], enabled: boolean) {
  return useQuery({
    queryKey: reservationPreviewKey(id, "bill", actions),
    queryFn: () => previewWorkflow(id, { requestId: crypto.randomUUID(), actions }),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
