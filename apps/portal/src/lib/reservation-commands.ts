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
import { ApiError } from "./api-error.ts";
import type { ReservationStay } from "./assignment-availability.ts";

export type ReservationCommandResult =
  | { status: "saved"; reservation: ReservationDetail }
  | { status: "rejected"; fields: Record<string, string> }
  | { status: "failed"; message: string };

const fallbackMessage = "No se pudieron guardar los cambios.";

// Unsettled commands live in the query cache, so removing queries on sign-out or
// clearing the client forgets them. Nothing observes this entry; it never refetches.
const unsettledKey = ["reservation-commands", "unsettled"] as const;

function unsettledCommands(client: QueryClient) {
  const held = client.getQueryData<Map<string, WorkflowCommand>>(unsettledKey);
  if (held) return held;
  const created = new Map<string, WorkflowCommand>();
  client.setQueryDefaults(unsettledKey, { gcTime: Infinity, staleTime: Infinity });
  client.setQueryData(unsettledKey, created);
  return created;
}

type Runtime = {
  /** The last queued save per Reservation; the next one starts after it settles. */
  tails: Map<string, Promise<unknown>>;
  /** Queued or running saves by Reservation and exact actions, for joining. */
  running: Map<string, Promise<ReservationCommandResult>>;
  saving: Map<string, number>;
  listeners: Set<() => void>;
};

const runtimes = new WeakMap<QueryClient, Runtime>();

function runtime(client: QueryClient) {
  let found = runtimes.get(client);
  if (!found) {
    found = { tails: new Map(), running: new Map(), saving: new Map(), listeners: new Set() };
    runtimes.set(client, found);
  }
  return found;
}

function changeSaving(state: Runtime, id: string, delta: number) {
  const count = (state.saving.get(id) ?? 0) + delta;
  if (count > 0) state.saving.set(id, count);
  else state.saving.delete(id);
  for (const listener of state.listeners) listener();
}

/** The form field a rejection belongs to, or null when it is not this rule's. */
type FieldRule = (error: ApiError) => string | null;

const paymentFields: FieldRule[] = [
  ({ code }) =>
    code === "payment date cannot be in the future" || code === "payment date is required"
      ? "date"
      : null,
  ({ code }) => (code === "amount cannot be zero" ? "amount" : null),
  ({ code }) => (code === "method is required" ? "method" : null),
];

// Staying guests share the Booking contact's email and phone field names in their form.
const personFields: FieldRule[] = [
  ({ code }) => (code === "invalid email" ? "email" : null),
  ({ field }) => (field === "phone" ? "phone" : null),
];

const stayFields: FieldRule[] = [
  ({ code }) =>
    code === "stay cannot be longer than 60 nights" || code === "stay must be at least one night"
      ? "checkOut"
      : null,
];

// The fields a rejection may name depend on what the command changed.
const fieldsByAction: Partial<Record<WorkflowAction["type"], FieldRule[]>> = {
  "add-payment": paymentFields,
  "edit-payment": paymentFields,
  contact: personFields,
  "set-guests": [
    ...personFields,
    ({ code }) =>
      code === "guest room must belong to this reservation" ? "reservationRoomId" : null,
  ],
  dates: stayFields,
  "add-room": stayFields,
  "edit-room": stayFields,
  "remove-room": stayFields,
};

function rejectedFields(cause: unknown, actions: WorkflowAction[]) {
  if (!(cause instanceof ApiError)) return null;
  const fields: Record<string, string> = {};
  for (const action of actions)
    for (const rule of fieldsByAction[action.type] ?? []) {
      const name = rule(cause);
      if (name) fields[name] = cause.message;
    }
  return Object.keys(fields).length ? fields : null;
}

function rejection(cause: unknown, actions: WorkflowAction[]): ReservationCommandResult {
  const fields = rejectedFields(cause, actions);
  return fields ? { status: "rejected", fields } : failure(cause);
}

function failure(cause: unknown): ReservationCommandResult {
  return {
    status: "failed",
    message: cause instanceof Error && cause.message ? cause.message : fallbackMessage,
  };
}

const previewScope = "reservation-preview";

/**
 * A cache key for a bill preview of one Reservation. Saves to that Reservation
 * refresh every preview under it; `parts` distinguish the previews.
 */
export function reservationPreviewKey(id: string, ...parts: unknown[]) {
  return [previewScope, id, ...parts] as const;
}

// ADR 0001: a save that changes the calendar refreshes it.
async function refresh(client: QueryClient, saved: ReservationDetail, actions: WorkflowAction[]) {
  client.setQueryData(["reservation", saved.id], saved);
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
function enqueue(
  client: QueryClient,
  id: string,
  task: () => Promise<ReservationCommandResult>,
): Promise<ReservationCommandResult> {
  const state = runtime(client);
  changeSaving(state, id, 1);
  const result = (state.tails.get(id) ?? Promise.resolve())
    .then(task)
    .catch(failure)
    .finally(() => changeSaving(state, id, -1));
  state.tails.set(id, result);
  void result.then(() => {
    if (state.tails.get(id) === result) state.tails.delete(id);
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
  const state = runtime(client);
  const joined = state.running.get(key);
  if (joined) return joined;
  const result = enqueue(client, id, async () => {
    // Read when the save starts, so a cache cleared meanwhile is not written back into.
    const unsettled = unsettledCommands(client);
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
    await refresh(client, saved, command.actions);
    return { status: "saved", reservation: saved };
  });
  state.running.set(key, result);
  void result.then(() => {
    if (state.running.get(key) === result) state.running.delete(key);
  });
  return result;
}

/**
 * The only way editors save changes to an existing Reservation. `send` never throws;
 * `saving` is true while any save to this Reservation is running or queued.
 */
export function useReservationCommands(id: string | null) {
  const client = useQueryClient();
  const state = runtime(client);
  const saving = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      [state],
    ),
    () => id !== null && state.saving.has(id),
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
      return enqueue(client, target.reservationId, async () => {
        let saved: ReservationDetail;
        try {
          saved = await assignRoom(target, roomId);
        } catch (cause) {
          return failure(cause);
        }
        await refresh(client, saved, []);
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
