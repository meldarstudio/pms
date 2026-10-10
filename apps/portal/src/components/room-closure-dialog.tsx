import { useState, type FormEvent } from "react"
import { addDays, differenceInCalendarDays, parse, startOfDay } from "date-fns"
import { EllipsisIcon } from "lucide-react"

import { DateField } from "@/components/date-field"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { type RoomClosure } from "@/lib/api"
import { useDeleteRoomClosure, useSaveRoomClosure } from "@/lib/queries"
import { format } from "@/lib/dates"

export type ClosureTarget =
  | {
      mode: "create"
      roomId: string
      number: string
      typeName: string
    }
  | {
      mode: "edit"
      closure: RoomClosure
      number: string
      typeName: string
    }

function closureError(error: Error) {
  if (error.message === "room has a stay on those dates") {
    return "Esta habitación tiene una reserva para esas fechas."
  }
  if (error.message === "room is already closed on those dates") {
    return "Esta habitación ya está cerrada para esas fechas."
  }
  if (error.message === "no availability") {
    return "No hay disponibilidad para esas fechas."
  }
  if (error.message === "stay cannot be longer than 60 nights") {
    return "El cierre no puede superar las 60 noches."
  }
  return error.message
}

function formKey(target: ClosureTarget) {
  return target.mode === "edit" ? target.closure.id : `new-${target.roomId}`
}

export function RoomActionsMenu({
  number,
  onEditRoom,
  onCloseRoom,
}: {
  number: string
  onEditRoom: () => void
  onCloseRoom: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Acciones de habitación ${number}`}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onEditRoom}>
            Editar habitación
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCloseRoom}>
            Cerrar habitación
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function RoomClosureDialog({
  target,
  timeZone,
  onClose,
}: {
  target: ClosureTarget | null
  timeZone: string
  onClose: () => void
}) {
  const save = useSaveRoomClosure()
  const remove = useDeleteRoomClosure()
  const pending = save.isPending || remove.isPending

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next && pending) return
        if (!next) onClose()
      }}
    >
      <DialogContent>
        {target ? (
          <ClosureForm
            key={formKey(target)}
            target={target}
            timeZone={timeZone}
            savePending={save.isPending}
            removePending={remove.isPending}
            error={
              save.error
                ? closureError(save.error)
                : remove.error
                  ? closureError(remove.error)
                  : null
            }
            onSave={(input) => {
              save.mutate(input, { onSuccess: onClose })
            }}
            onRemove={(id) => {
              remove.mutate(id, { onSuccess: onClose })
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ClosureForm({
  target,
  timeZone,
  savePending,
  removePending,
  error,
  onSave,
  onRemove,
}: {
  target: ClosureTarget
  timeZone: string
  savePending: boolean
  removePending: boolean
  error: string | null
  onSave: (input: {
    id?: string
    roomId: string
    starts: string
    ends: string
    reason?: string
  }) => void
  onRemove: (id: string) => void
}) {
  const pending = savePending || removePending
  const [startDate, setStartDate] = useState<Date | null>(() => {
    if (target.mode !== "edit") return null
    return startOfDay(parse(target.closure.starts, "yyyy-MM-dd", new Date()))
  })
  const [endDate, setEndDate] = useState<Date | null>(() => {
    if (target.mode !== "edit") return null
    return startOfDay(parse(target.closure.ends, "yyyy-MM-dd", new Date()))
  })
  const [reason, setReason] = useState(
    target.mode === "edit" ? (target.closure.reason ?? "") : ""
  )
  const [localError, setLocalError] = useState<string | null>(null)
  const nights =
    startDate && endDate ? differenceInCalendarDays(endDate, startDate) : 0
  const shownError = localError ?? error

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!startDate || !endDate || pending) return
    if (nights < 1) {
      setLocalError("La reapertura debe ser posterior al inicio del cierre.")
      return
    }
    if (nights > 60) {
      setLocalError("El cierre no puede superar las 60 noches.")
      return
    }
    setLocalError(null)
    onSave({
      id: target.mode === "edit" ? target.closure.id : undefined,
      roomId: target.mode === "edit" ? target.closure.roomId : target.roomId,
      starts: format(startDate, "yyyy-MM-dd"),
      ends: format(endDate, "yyyy-MM-dd"),
      reason: reason.trim() || undefined,
    })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>
          {target.mode === "edit" ? "Editar cierre" : "Cerrar habitación"}
        </DialogTitle>
        <DialogDescription>
          {target.number}, {target.typeName}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={shownError ? true : undefined}>
          <div className="grid grid-cols-2 gap-2">
            <DateField
              id="closure-start"
              label="Desde"
              value={startDate}
              timeZone={timeZone}
              disabled={endDate ? { after: addDays(endDate, -1) } : undefined}
              onChange={(date) => {
                setStartDate(date)
                setLocalError(null)
              }}
            />
            <DateField
              id="closure-end"
              label="Reapertura"
              value={endDate}
              timeZone={timeZone}
              disabled={
                startDate
                  ? [
                      { before: addDays(startDate, 1) },
                      { after: addDays(startDate, 60) },
                    ]
                  : undefined
              }
              onChange={(date) => {
                setEndDate(date)
                setLocalError(null)
              }}
            />
          </div>
          <FieldDescription>
            {startDate && endDate && nights >= 1
              ? `${nights} ${nights === 1 ? "noche cerrada" : "noches cerradas"}. Disponible el ${format(endDate, "d MMM yyyy")}.`
              : "Selecciona el inicio del cierre y la fecha de reapertura."}
          </FieldDescription>
          {shownError ? <FieldError>{shownError}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="closure-reason">Motivo</FieldLabel>
          <Input
            id="closure-reason"
            value={reason}
            maxLength={80}
            placeholder="Opcional"
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        {target.mode === "edit" ? (
          <Button
            type="button"
            variant="destructive"
            className="sm:mr-auto"
            disabled={pending}
            onClick={() => onRemove(target.closure.id)}
          >
            {removePending ? <Spinner data-icon="inline-start" /> : null}
            Eliminar
          </Button>
        ) : null}
        <DialogClose
          disabled={pending}
          render={<Button variant="outline" type="button" />}
        >
          Cancelar
        </DialogClose>
        <Button
          type="submit"
          disabled={
            !startDate || !endDate || nights < 1 || nights > 60 || pending
          }
        >
          {savePending ? <Spinner data-icon="inline-start" /> : null}
          {target.mode === "edit" ? "Guardar" : "Cerrar habitación"}
        </Button>
      </DialogFooter>
    </form>
  )
}
