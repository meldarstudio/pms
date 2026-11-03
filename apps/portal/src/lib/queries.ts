import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { addDateLabelDays } from "@/lib/dates";
import { usePropertyCalendar } from "@/lib/use-property-calendar";
import {
  type CalendarWindow,
  createRoomClosure,
  deleteRoomClosure,
  deleteRoomTypeRates,
  getAvailability,
  getCalendar,
  getCoupon,
  getHousekeeping,
  getInventory,
  getReservation,
  getSession,
  listReservations,
  listRoomClosures,
  listRoomTypes,
  listRooms,
  listAccounts,
  listRatePlans,
  previewWorkflowBooking,
  login,
  setAccountPassword,
  changeOwnPassword,
  logout,
  patchRoom,
  onUnauthorized,
  patchRoomClosure,
  putRoomTypeRates,
  savePropertySetup,
  searchReservationsPage,
  markHousekeeping,
  type HousekeepingList,
  type HousekeepingMark,
  type HousekeepingMarkInput,
  type HousekeepingStatus,
  type ReservationListParams,
  type AvailabilityFilters,
  type CreationPreviewInput,
  type Room,
  type RoomType,
} from "@/lib/api";

export const sessionQueryKey = ["session"] as const;

export function useCoupon(code: string, enabled: boolean) {
  return useQuery({
    queryKey: ["coupon", code],
    queryFn: ({ signal }) => getCoupon(code, signal),
    enabled: enabled && !!code,
    refetchOnWindowFocus: false,
  });
}

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

export function useAccounts(enabled: boolean) {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: ({ signal }) => listAccounts(signal),
    enabled,
  });
}

export function useSetAccountPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      setAccountPassword(id, password),
  });
}

export function useChangeOwnPassword() {
  return useMutation({ mutationFn: changeOwnPassword });
}

const holdDays = 7;

function expandedRange(from: string, to: string) {
  return {
    from: addDateLabelDays(from, -holdDays),
    to: addDateLabelDays(to, holdDays),
  };
}

function sliceCalendar(window: CalendarWindow, from: string, to: string): CalendarWindow {
  return {
    from,
    to,
    missingSetup: window.missingSetup,
    rooms: window.rooms.map((room) => ({
      ...room,
      stays: room.stays.filter((stay) => stay.checkIn <= to && stay.checkOut >= from),
      closures: room.closures.filter((closure) => closure.starts <= to && closure.ends >= from),
    })),
    unassigned: window.unassigned.filter((stay) => stay.checkIn <= to && stay.checkOut > from),
  };
}

function coveringHold(client: QueryClient, from: string, to: string) {
  for (const [key, data] of client.getQueriesData<CalendarWindow>({ queryKey: ["calendar"] })) {
    const heldFrom = key[1];
    const heldTo = key[2];
    if (typeof heldFrom !== "string" || typeof heldTo !== "string" || !data) continue;
    if (heldFrom <= from && heldTo >= to) return { from: heldFrom, to: heldTo };
  }
  return null;
}

export function useCalendar(from: string, to: string) {
  const client = useQueryClient();
  const range = coveringHold(client, from, to) ?? expandedRange(from, to);
  return useQuery({
    queryKey: ["calendar", range.from, range.to],
    queryFn: ({ signal }) => getCalendar(range.from, range.to, signal),
    select: (window) => sliceCalendar(window, from, to),
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

export function useRatePlans() {
  return useQuery({
    queryKey: ["rate-plans"],
    queryFn: ({ signal }) => listRatePlans(signal),
    staleTime: Infinity,
  });
}

export function useCreationPreview(input: CreationPreviewInput | null) {
  const draft = JSON.stringify(input);
  const [settled, setSettled] = useState(draft);
  const current = settled === draft;
  useEffect(() => {
    if (current) return;
    const timer = setTimeout(() => setSettled(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, current]);
  const settledInput = JSON.parse(settled) as CreationPreviewInput | null;
  const preview = useQuery({
    queryKey: ["creation-preview", settledInput],
    queryFn: () => previewWorkflowBooking(settledInput!),
    enabled: current && settledInput !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return { ...preview, current };
}

export function refreshAfterCreation(client: QueryClient) {
  return Promise.all(
    ["reservations", "availability", "inventory", "calendar", housekeepingQueryKey[0]].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
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
        [
          "rooms",
          "room-types",
          "inventory",
          "availability",
          "reservations",
          "reservation",
          "calendar",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
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
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export const housekeepingQueryKey = ["housekeeping"] as const;
const housekeepingMarkMutationKey = ["housekeeping", "mark"] as const;

export function usePendingHousekeepingRoomIds() {
  const pending = useMutationState({
    filters: { mutationKey: housekeepingMarkMutationKey, status: "pending" },
    select: (mutation) =>
      (mutation.state.variables as HousekeepingMarkInput[]).map((mark) => mark.roomId),
  });
  return new Set(pending.flat());
}

export function useHousekeeping() {
  const { today } = usePropertyCalendar();
  const query = useQuery({
    queryKey: housekeepingQueryKey,
    queryFn: ({ signal }) => getHousekeeping(signal),
  });
  const listDate = query.data?.date;
  const { refetch } = query;
  useEffect(() => {
    if (listDate && listDate !== today) void refetch();
  }, [listDate, today, refetch]);
  return query;
}

export function useMarkHousekeeping() {
  const client = useQueryClient();
  const setRooms = (marks: Map<string, Partial<HousekeepingMark>>) =>
    client.setQueryData<HousekeepingList>(housekeepingQueryKey, (list) =>
      list
        ? {
            ...list,
            rooms: list.rooms.map((room) => {
              const mark = marks.get(room.id);
              return mark ? { ...room, ...mark } : room;
            }),
          }
        : list,
    );
  const setCalendarRooms = (statuses: Map<string, HousekeepingStatus>, queryKey?: QueryKey) =>
    client.setQueriesData<CalendarWindow>(
      { queryKey: queryKey ?? ["calendar"], exact: !!queryKey },
      (window) =>
        window
          ? {
              ...window,
              rooms: window.rooms.map((room) => {
                const status = statuses.get(room.id);
                return status ? { ...room, housekeepingStatus: status } : room;
              }),
            }
          : window,
    );
  return useMutation({
    mutationFn: markHousekeeping,
    mutationKey: housekeepingMarkMutationKey,
    onMutate: async (marks) => {
      await client.cancelQueries({ queryKey: housekeepingQueryKey });
      await client.cancelQueries({ queryKey: ["calendar"] });
      const marked = new Set(marks.map((mark) => mark.roomId));
      const previous = new Map<string, HousekeepingMark>();
      for (const room of client.getQueryData<HousekeepingList>(housekeepingQueryKey)?.rooms ?? [])
        if (marked.has(room.id))
          previous.set(room.id, {
            housekeepingStatus: room.housekeepingStatus,
            housekeepingChangedAt: room.housekeepingChangedAt,
          });
      const previousCalendar = client
        .getQueriesData<CalendarWindow>({ queryKey: ["calendar"] })
        .map(([queryKey, window]) => {
          const statuses = new Map<string, HousekeepingStatus>();
          for (const room of window?.rooms ?? [])
            if (marked.has(room.id)) statuses.set(room.id, room.housekeepingStatus);
          return { queryKey, statuses };
        });
      setRooms(new Map(marks.map((mark) => [mark.roomId, { housekeepingStatus: mark.status }])));
      setCalendarRooms(new Map(marks.map((mark) => [mark.roomId, mark.status])));
      return { previous, previousCalendar };
    },
    onError: (_error, _marks, context) => {
      if (!context) return;
      setRooms(context.previous);
      for (const { queryKey, statuses } of context.previousCalendar)
        setCalendarRooms(statuses, queryKey);
    },
    onSuccess: async ({ rooms }) => {
      setRooms(new Map(rooms.map(({ id, ...mark }) => [id, mark])));
      await client.invalidateQueries({ queryKey: housekeepingQueryKey });
      await client.invalidateQueries({ queryKey: ["calendar"] });
      await client.invalidateQueries({ queryKey: ["reservation"] });
    },
  });
}

export function useAvailability(
  checkIn: string,
  checkOut: string,
  enabled = true,
  filters?: AvailabilityFilters,
) {
  return useQuery({
    queryKey: ["availability", checkIn, checkOut, filters],
    queryFn: ({ signal }) => getAvailability(checkIn, checkOut, signal, filters),
    enabled,
  });
}

export function useReservation(
  id: string | null,
  { refetchOnReconnect = false }: { refetchOnReconnect?: boolean } = {},
) {
  return useQuery({
    queryKey: ["reservation", id],
    queryFn: ({ signal }) => getReservation(id!, signal),
    enabled: id !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect,
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["room-closures"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useDeleteRoomClosure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoomClosure(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["room-closures"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
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
