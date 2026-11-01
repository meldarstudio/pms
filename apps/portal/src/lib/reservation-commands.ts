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
  | { status: "failed"; message: string; code?: string };

const fallbackMessage = "No se pudieron guardar los cambios.";

const unsettledKey = ["reservation-commands", "unsettled"] as const;

type UnsettledCommands = Map<string, { command: WorkflowCommand; uncertain: boolean }>;

function unsettledCommands(client: QueryClient) {
  const existing = client.getQueryData<UnsettledCommands>(unsettledKey);
  if (existing) return existing;
  const created: UnsettledCommands = new Map();
  client.setQueryDefaults(unsettledKey, { gcTime: Infinity, staleTime: Infinity });
  client.setQueryData(unsettledKey, created);
  return created;
}

type SaveQueue = {
  lastSave: Map<string, Promise<unknown>>;
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

const scopeByAction: Partial<Record<WorkflowAction["type"], FieldScope>> = {
  "waive-cancellation-charge": "waiver",
  "redeem-coupon": "coupon",
  "add-payment": "payment",
  "edit-payment": "payment",
  "request-refund": "refund",
  "request-culqi-refund": "refund",
  "issue-coupon": "refund",
  "complete-refund": "refund",
  "fail-refund": "refund",
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

export function unsavedMessage(result: Exclude<ReservationCommandResult, { status: "saved" }>) {
  return result.status === "failed" ? result.message : Object.values(result.fields).join(" ");
}

const previewScope = "reservation-preview";

type PreviewParts =
  | [kind: "bill", actions: WorkflowAction[]]
  | [kind: "billing", pricingKey: string]
  | [kind: "edit", command: WorkflowCommand, pricingKey: string];

export function reservationPreviewKey(id: string, ...parts: PreviewParts) {
  return [previewScope, id, ...parts] as const;
}

const dependentReads = [
  "reservations",
  "availability",
  "inventory",
  "payments",
  "calendar",
  "coupon",
];

async function refreshAll(client: QueryClient, id: string) {
  await client.cancelQueries({ queryKey: [previewScope, id] });
  await Promise.all([
    client.invalidateQueries({ queryKey: ["reservation", id] }),
    ...dependentReads.map((key) => client.invalidateQueries({ queryKey: [key] })),
    client.invalidateQueries({ queryKey: [previewScope, id] }),
  ]);
}

async function refresh(client: QueryClient, saved: ReservationDetail, actions: WorkflowAction[]) {
  client.setQueryData(["reservation", saved.id], saved);
  await client.cancelQueries({ queryKey: [previewScope, saved.id] });
  await Promise.all([
    ...dependentReads.map((key) => client.invalidateQueries({ queryKey: [key] })),
    client.invalidateQueries({ queryKey: [previewScope, saved.id] }),
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

export const earlierAttemptSaved = "request ID reused with a different payload";

function save(
  client: QueryClient,
  id: string,
  actions: WorkflowAction[],
  retryKey?: string,
): Promise<ReservationCommandResult> {
  const snapshot = JSON.stringify(actions);
  const key = `${id}\n${snapshot}`;
  const memory = retryKey === undefined ? key : `${id}\n#${retryKey}`;
  const queue = saveQueue(client);
  const joined = queue.joinable.get(key);
  if (joined?.session === unsettledCommands(client)) return joined.result;
  const result = enqueue(client, id, async (unsettled) => {
    const command = {
      requestId: unsettled.get(memory)?.command.requestId ?? crypto.randomUUID(),
      actions: JSON.parse(snapshot) as WorkflowAction[],
    };
    let saved: ReservationDetail;
    try {
      saved = await sendWorkflow(id, command);
      unsettled.delete(memory);
    } catch (cause) {
      if (memory !== key && cause instanceof ApiError && cause.code === earlierAttemptSaved) {
        unsettled.delete(memory);
        if (unsettledCommands(client) === unsettled) await refreshAll(client, id);
        return failure(cause);
      }
      unsettled.set(memory, {
        command,
        uncertain: !(cause instanceof ApiError) || cause.status >= 500,
      });
      return rejection(cause, command.actions);
    }
    if (unsettledCommands(client) === unsettled) await refresh(client, saved, command.actions);
    return { status: "saved", reservation: saved };
  });
  queue.joinable.set(key, { session: unsettledCommands(client), result });
  void result.then(() => {
    if (queue.joinable.get(key)?.result === result) queue.joinable.delete(key);
  });
  return result;
}

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
    (actions: WorkflowAction[], retryKey?: string): Promise<ReservationCommandResult> =>
      id === null ? Promise.resolve(failure(null)) : save(client, id, actions, retryKey),
    [client, id],
  );
  const canReplay = useCallback(
    (actions: WorkflowAction[]) =>
      id !== null &&
      client.getQueryData<UnsettledCommands>(unsettledKey)?.get(`${id}\n${JSON.stringify(actions)}`)
        ?.uncertain === true,
    [client, id],
  );
  return { send, saving, canReplay };
}

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

export function useReservationPreview(
  id: string,
  actions: WorkflowAction[],
  enabled: boolean,
  propertyDate?: string,
) {
  const key = reservationPreviewKey(id, "bill", actions);
  return useQuery({
    queryKey: propertyDate ? [...key, propertyDate] : key,
    queryFn: () => previewWorkflow(id, { requestId: crypto.randomUUID(), actions }),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
