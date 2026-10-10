import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { usePatchRoom, useRoomTypes } from "@/lib/queries"

export type RoomEditTarget = {
  roomId: string
  number: string
  roomTypeId: string
  typeName: string
}

function roomEditError(error: Error) {
  if (error.message === "room number already exists") {
    return "Este número de habitación ya está en uso."
  }
  if (error.message === "room has an assigned stay") {
    return "Desasigna la estancia o muévela a otra habitación antes de cambiar el tipo."
  }
  if (error.message === "no availability") {
    return "Este tipo no tendría suficientes habitaciones para las reservas existentes."
  }
  if (error.message === "room type not found") {
    return "Este tipo de habitación ya no existe."
  }
  if (error.message === "room not found") {
    return "Esta habitación ya no existe."
  }
  return error.message
}

function errorOn(message: string | null) {
  if (message === "Este número de habitación ya está en uso.") return "number"
  if (
    message ===
      "Desasigna la estancia o muévela a otra habitación antes de cambiar el tipo." ||
    message === "Este tipo de habitación ya no existe." ||
    message ===
      "Este tipo no tendría suficientes habitaciones para las reservas existentes."
  ) {
    return "type"
  }
  return message ? "number" : null
}

export function RoomEditDialog({
  target,
  onClose,
}: {
  target: RoomEditTarget | null
  onClose: () => void
}) {
  const save = usePatchRoom()

  function close() {
    save.reset()
    onClose()
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && save.isPending) return
        if (!next) close()
      }}
    >
      <DialogContent>
        {target ? (
          <RoomEditForm
            key={`${target.roomId}-${target.number}-${target.roomTypeId}`}
            target={target}
            pending={save.isPending}
            error={save.error ? roomEditError(save.error) : null}
            onSave={(input) => {
              save.mutate(input, { onSuccess: close })
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RoomEditForm({
  target,
  pending,
  error,
  onSave,
}: {
  target: RoomEditTarget
  pending: boolean
  error: string | null
  onSave: (input: { id: string; number?: string; roomTypeId?: string }) => void
}) {
  const typesQuery = useRoomTypes()
  const [number, setNumber] = useState(target.number)
  const [roomTypeId, setRoomTypeId] = useState(target.roomTypeId)
  const types = typesQuery.data ?? []
  const typeItems = types.some((type) => type.id === target.roomTypeId)
    ? types.map((type) => ({ value: type.id, label: type.name }))
    : [
        { value: target.roomTypeId, label: target.typeName },
        ...types.map((type) => ({ value: type.id, label: type.name })),
      ]
  const trimmed = number.trim()
  const unchanged =
    trimmed === target.number && roomTypeId === target.roomTypeId
  const invalid = errorOn(error)
  const numberInvalid = invalid === "number"
  const typeInvalid = invalid === "type"

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmed || unchanged || pending) return
    onSave({
      id: target.roomId,
      ...(trimmed === target.number ? {} : { number: trimmed }),
      ...(roomTypeId === target.roomTypeId ? {} : { roomTypeId }),
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Editar habitación</DialogTitle>
        <DialogDescription>
          {target.number}, {target.typeName}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={numberInvalid || undefined}>
          <FieldLabel htmlFor="room-number">Número</FieldLabel>
          <Input
            id="room-number"
            value={number}
            maxLength={20}
            disabled={pending}
            aria-invalid={numberInvalid || undefined}
            onChange={(event) => setNumber(event.target.value)}
          />
          {numberInvalid ? <FieldError>{error}</FieldError> : null}
        </Field>
        <Field data-invalid={typeInvalid || undefined}>
          <FieldLabel htmlFor="room-type">Tipo</FieldLabel>
          <Select
            items={typeItems}
            value={roomTypeId}
            disabled={pending || typesQuery.isPending}
            onValueChange={(value) => {
              if (value) setRoomTypeId(value)
            }}
          >
            <SelectTrigger
              id="room-type"
              className="w-full"
              aria-invalid={typeInvalid || undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {typeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {typeInvalid ? <FieldError>{error}</FieldError> : null}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose
          disabled={pending}
          render={<Button variant="outline" type="button" />}
        >
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={!trimmed || unchanged || pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  )
}
