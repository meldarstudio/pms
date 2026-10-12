import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import {
  sendWorkflow,
  type WorkflowCommand,
  assignRoom,
  createRoomClosure,
  deleteRoomClosure,
  deleteRoomTypeRates,
  getAvailability,
  getInventory,
  getReservation,
  listReservations,
  listRoomClosures,
  listRoomTypes,
  listRooms,
  patchGuest,
  patchRoom,
  patchRoomClosure,
  putRoomTypeRates,
  type PatchGuestInput,
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

export function usePatchRoom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: string
      number?: string
      roomTypeId?: string
    }) => {
      const { id, ...body } = input
      return patchRoom(id, body)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] })
      await queryClient.invalidateQueries({ queryKey: ["availability"] })
    },
  })
}

export function useAvailability(checkIn: string, checkOut: string) {
  return useQuery({
    queryKey: ["availability", checkIn, checkOut],
    queryFn: ({ signal }) => getAvailability(checkIn, checkOut, signal),
  })
}

export function useReservation(id: string | null) {
  return useQuery({
    queryKey: ["reservation", id],
    queryFn: ({ signal }) => getReservation(id!, signal),
    enabled: id !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function usePatchGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; body: PatchGuestInput }) =>
      patchGuest(input.id, input.body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservations"] })
      await queryClient.invalidateQueries({ queryKey: ["reservation"] })
    },
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
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({ queryKey: ["reservations"] })
      await queryClient.invalidateQueries({
        queryKey: ["reservation", input.reservationId],
      })
    },
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

async function refreshRates(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["inventory"] })
  await queryClient.invalidateQueries({ queryKey: ["availability"] })
}

export function useInventory(from: string, to: string) {
  return useQuery({
    queryKey: ["inventory", from, to],
    queryFn: ({ signal }) => getInventory(from, to, signal),
    placeholderData: keepPreviousData,
  })
}

export function usePutRoomTypeRates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: string
      from: string
      to: string
      priceCents: number
      weekdays?: number[]
    }) => {
      const { id, ...body } = input
      return putRoomTypeRates(id, body)
    },
    onSuccess: () => refreshRates(queryClient),
  })
}

export function useDeleteRoomTypeRates() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      ranges: { from: string; to: string }[]
    }) => {
      let deleted = 0
      for (const range of input.ranges) {
        const result = await deleteRoomTypeRates(input.id, range.from, range.to)
        deleted += result.deleted
      }
      return { deleted }
    },
    onSuccess: () => refreshRates(queryClient),
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

export function useWorkflowCommand() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: WorkflowCommand }) =>
      sendWorkflow(id, command),
    onSuccess: async (data) => {
      client.setQueryData(["reservation", data.id], data)
      await Promise.all(
        ["reservations", "availability", "inventory", "payments"].map((key) =>
          client.invalidateQueries({ queryKey: [key] })
        )
      )
    },
  })
}
