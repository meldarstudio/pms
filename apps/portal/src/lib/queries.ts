import { useEffect } from "react";
import {
  keepPreviousData,
  useMutation,
  useIsMutating,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { refreshWorkflowQueries, workflowMutationKey } from "./workflow-query-cache";

import {
  sendWorkflow,
  type WorkflowCommand,
  assignRoom,
  createRoomClosure,
  deleteRoomClosure,
  deleteRoomTypeRates,
  getAvailability,
  getCalendar,
  getInventory,
  getReservation,
  getSession,
  listReservations,
  listRoomClosures,
  listRoomTypes,
  listRooms,
  login,
  logout,
  patchGuest,
  patchRoom,
  onUnauthorized,
  patchRoomClosure,
  putRoomTypeRates,
  savePropertySetup,
  searchReservationsPage,
  type ReservationListParams,
  type PatchGuestInput,
  type AvailabilityOccupancy,
  type Room,
  type RoomType,
} from "@/lib/api";

export const sessionQueryKey = ["session"] as const;

export function useSession() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => getSession(signal),
    retry: false,
    staleTime: Infinity,
  });
}

function setSignedOut(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
  queryClient.setQueryData(sessionQueryKey, null);
}

export function useSignedOutOnUnauthorized() {
  const queryClient = useQueryClient();
  useEffect(() => onUnauthorized(() => setSignedOut(queryClient)), [queryClient]);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (session) => queryClient.setQueryData(sessionQueryKey, session),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSuccess: () => setSignedOut(queryClient),
  });
}

export function useCalendar(from: string, to: string) {
  return useQuery({
    queryKey: ["calendar", from, to],
    queryFn: ({ signal }) => getCalendar(from, to, signal),
    placeholderData: keepPreviousData,
  });
}

export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: ({ signal }) => listRooms(signal),
  });
}

export function useRoomTypes() {
  return useQuery({
    queryKey: ["room-types"],
    queryFn: ({ signal }) => listRoomTypes(signal),
  });
}

export function useSavePropertySetup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: savePropertySetup,
    onSuccess: async (result) => {
      client.setQueryData<RoomType[]>(["room-types"], (previous = []) => {
        const exists = previous.some((type) => type.id === result.roomType.id);
        return exists
          ? previous.map((type) => (type.id === result.roomType.id ? result.roomType : type))
          : [...previous, result.roomType];
      });
      client.setQueryData<Room[]>(["rooms"], (previous = []) => [
        ...previous.filter((room) => room.roomTypeId !== result.roomType.id),
        ...result.rooms,
      ]);
      await Promise.all(
        ["rooms", "room-types", "inventory", "availability", "reservations", "reservation"].map(
          (key) => client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}

export function useMissingSetup(): "types" | "rooms" | null {
  const roomTypes = useRoomTypes();
  const rooms = useRooms();
  if (!roomTypes.isSuccess || !rooms.isSuccess) return null;
  if (roomTypes.data.length === 0) return "types";
  return rooms.data.length === 0 ? "rooms" : null;
}

export function usePatchRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; number?: string; roomTypeId?: string }) => {
      const { id, ...body } = input;
      return patchRoom(id, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useAvailability(
  checkIn: string,
  checkOut: string,
  enabled = true,
  occupancy?: AvailabilityOccupancy,
) {
  return useQuery({
    queryKey: ["availability", checkIn, checkOut, occupancy],
    queryFn: ({ signal }) => getAvailability(checkIn, checkOut, signal, occupancy),
    enabled,
  });
}

export function useReservation(id: string | null) {
  return useQuery({
    queryKey: ["reservation", id],
    queryFn: ({ signal }) => getReservation(id!, signal),
    enabled: id !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function usePatchGuest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: PatchGuestInput }) => patchGuest(input.id, input.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservations"] });
      await queryClient.invalidateQueries({ queryKey: ["reservation"] });
    },
  });
}

export function useAssignRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reservationId: string; lineId: string; roomId: string }) =>
      assignRoom(input.reservationId, input.lineId, input.roomId),
    onSuccess: (data) => refreshWorkflowQueries(queryClient, data),
  });
}

export function useRoomClosures(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["room-closures", from, to],
    queryFn: ({ signal }) => listRoomClosures(from, to, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSaveRoomClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id?: string;
      roomId: string;
      starts: string;
      ends: string;
      reason?: string;
    }) =>
      input.id
        ? patchRoomClosure(input.id, {
            starts: input.starts,
            ends: input.ends,
            reason: input.reason ?? null,
          })
        : createRoomClosure({
            roomId: input.roomId,
            starts: input.starts,
            ends: input.ends,
            ...(input.reason ? { reason: input.reason } : {}),
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-closures"] }),
  });
}

export function useDeleteRoomClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoomClosure(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room-closures"] }),
  });
}

async function refreshRates(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["inventory"] });
  await queryClient.invalidateQueries({ queryKey: ["availability"] });
}

export function useInventory(from: string, to: string) {
  return useQuery({
    queryKey: ["inventory", from, to],
    queryFn: ({ signal }) => getInventory(from, to, signal),
    placeholderData: keepPreviousData,
  });
}

export function usePutRoomTypeRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      from: string;
      to: string;
      priceCents: number;
      weekdays?: number[];
    }) => {
      const { id, ...body } = input;
      return putRoomTypeRates(id, body);
    },
    onSuccess: () => refreshRates(queryClient),
  });
}

export function useDeleteRoomTypeRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; ranges: { from: string; to: string }[] }) => {
      let deleted = 0;
      for (const range of input.ranges) {
        const result = await deleteRoomTypeRates(input.id, range.from, range.to);
        deleted += result.deleted;
      }
      return { deleted };
    },
    onSuccess: () => refreshRates(queryClient),
  });
}

export function useReservations(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["reservations", from, to],
    queryFn: ({ signal }) => listReservations(from, to, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useReservationList(params: ReservationListParams) {
  return useQuery({
    queryKey: ["reservations", "operations", params],
    queryFn: ({ signal }) => searchReservationsPage(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useReservationSaving(id: string | null) {
  return useIsMutating({ mutationKey: workflowMutationKey(id) }) > 0;
}

export function useWorkflowCommand(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: workflowMutationKey(id),
    // Each command reads a reservation snapshot. Finish the previous save before
    // starting the next so a discount autosave cannot undo a cancellation.
    scope: { id: `reservation-workflow:${id}` },
    mutationFn: ({ id, command }: { id: string; command: WorkflowCommand }) =>
      sendWorkflow(id, command),
    onSuccess: async (data, { command }) => {
      await refreshWorkflowQueries(client, data);
      if (command.actions.some((action) => action.type === "contact"))
        await client.invalidateQueries({
          queryKey: ["reservation"],
          predicate: (query) => query.queryKey[1] !== data.id,
        });
    },
  });
}
