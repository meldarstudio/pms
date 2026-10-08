import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import {
  assignRoom,
  createReservation,
  createRoomClosure,
  deleteRoomClosure,
  getAvailability,
  listReservations,
  listRoomClosures,
  listRoomTypes,
  listRooms,
  patchRoomClosure,
  type CreateReservationInput,
} from "@/lib/api"

export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: ({ signal }) => listRooms(signal),
  })
}

export function useRoomTypes() {
  return useQuery({
    queryKey: ["room-types"],
    queryFn: ({ signal }) => listRoomTypes(signal),
  })
}

export function useAvailability(checkIn: string, checkOut: string) {
  return useQuery({
    queryKey: ["availability", checkIn, checkOut],
    queryFn: ({ signal }) => getAvailability(checkIn, checkOut, signal),
  })
}

export function useCreateReservation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReservationInput) => createReservation(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reservations"] }),
  })
}

export function useAssignRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      reservationId: string
      lineId: string
      roomId: string
    }) => assignRoom(input.reservationId, input.lineId, input.roomId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reservations"] }),
  })
}

export function useRoomClosures(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["room-closures", from, to],
    queryFn: ({ signal }) => listRoomClosures(from, to, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useSaveRoomClosure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id?: string
      roomId: string
      starts: string
      ends: string
      reason?: string
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["room-closures"] }),
  })
}

export function useDeleteRoomClosure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRoomClosure(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["room-closures"] }),
  })
}

export function useReservations(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["reservations", from, to],
    queryFn: ({ signal }) => listReservations(from, to, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}
