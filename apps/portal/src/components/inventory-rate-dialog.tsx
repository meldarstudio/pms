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
import { Spinner } from "@/components/ui/spinner"
import type { InventoryNight } from "@/lib/api"
import { formatMajor, parseMajorToCents } from "@/lib/money"
import { useDeleteRoomTypeRates, usePutRoomTypeRates } from "@/lib/queries"
import { contiguousRanges } from "@/lib/rate-ranges"

export type RateTarget = {
  roomTypeId: string
  roomTypeName: string
  label: string
  dates: string[]
  nights: InventoryNight[]
}

function rateError(error: Error) {
  if (error.message === "room type not found") {
    return "Este tipo de habitación ya no existe."
  }
  return error.message
}

function sharedPrice(nights: InventoryNight[]) {
  const prices = new Set(nights.map((night) => night.priceCents))
  if (prices.size !== 1) return ""
  const [only] = prices
  return only === undefined ? "" : formatMajor(only)
}

export function InventoryRateDialog({
  target,
  currency,
  onClose,
}: {
  target: RateTarget | null
  currency: string
  onClose: () => void
}) {
  const put = usePutRoomTypeRates()
  const clear = useDeleteRoomTypeRates()
  const pending = put.isPending || clear.isPending

  function finish() {
    put.reset()
    clear.reset()
    onClose()
  }

  function close() {
    if (pending) return
    finish()
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent>
        {target ? (
          <RateForm
            key={target.dates.join(",")}
            target={target}
            currency={currency}
            pending={pending}
            saving={put.isPending}
            error={
              put.error
                ? rateError(put.error)
                : clear.error
                  ? rateError(clear.error)
                  : null
            }
            onApply={async (input) => {
              await put.mutateAsync(input)
              finish()
            }}
            onClear={async (ranges) => {
              await clear.mutateAsync({ id: target.roomTypeId, ranges })
              finish()
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RateForm({
  target,
  currency,
  pending,
  saving,
  error,
  onApply,
  onClear,
}: {
  target: RateTarget
  currency: string
  pending: boolean
  saving: boolean
  error: string | null
  onApply: (input: {
    id: string
    from: string
    to: string
    priceCents: number
  }) => Promise<void>
  onClear: (ranges: { from: string; to: string }[]) => Promise<void>
}) {
  const [price, setPrice] = useState(sharedPrice(target.nights))
  const [localError, setLocalError] = useState<string | null>(null)
  const cents = parseMajorToCents(price)
  const unchanged =
    cents !== null &&
    target.nights.length > 0 &&
    target.nights.every((night) => night.priceCents === cents)
  const canClear = target.nights.some((night) => night.override)
  const message = localError ?? error
  const range = target.dates.length > 1

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (cents === null) {
      setLocalError("Ingresa un precio como 310.00.")
      return
    }
    setLocalError(null)
    try {
      await onApply({
        id: target.roomTypeId,
        from: target.dates[0],
        to: target.dates[target.dates.length - 1],
        priceCents: cents,
      })
    } catch (cause) {
      setLocalError(
        cause instanceof Error
          ? rateError(cause)
          : "No se pudo guardar el precio."
      )
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{target.roomTypeName}</DialogTitle>
        <DialogDescription>
          {target.label}. Las reservas existentes conservan sus precios.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={message ? true : undefined}>
          <FieldLabel htmlFor="inventory-price">Precio ({currency})</FieldLabel>
          <Input
            id="inventory-price"
            inputMode="decimal"
            autoComplete="off"
            placeholder={price ? undefined : "Varios precios"}
            value={price}
            disabled={pending}
            aria-invalid={message ? true : undefined}
            onChange={(event) => {
              setPrice(event.target.value)
              setLocalError(null)
            }}
          />
          {message ? <FieldError>{message}</FieldError> : null}
        </Field>
      </FieldGroup>
      <DialogFooter>
        {canClear ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setLocalError(null)
              const dates = target.nights
                .filter((night) => night.override)
                .map((night) => night.date)
              void onClear(contiguousRanges(dates)).catch((cause: unknown) => {
                setLocalError(
                  cause instanceof Error
                    ? rateError(cause)
                    : "No se pudo restablecer el precio."
                )
              })
            }}
          >
            {range ? "Restablecer tarifas" : "Usar tarifa base"}
          </Button>
        ) : null}
        <DialogClose
          disabled={pending}
          render={<Button variant="outline" type="button" />}
        >
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={cents === null || unchanged || pending}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  )
}
