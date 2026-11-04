import { MoonIcon, PencilIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { SectionHeading } from "@/components/reservation-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function TextBar({ className, width }: { className?: string; width: string }) {
  return (
    <span className={cn("block", className)}>
      <Skeleton className={cn("inline-block h-lh align-top", width)} />
    </span>
  );
}

const factLabel = "text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase";

export function ReservationOverviewSkeleton() {
  return (
    <div aria-busy className="min-w-0">
      <p role="status" className="sr-only">
        Cargando reserva…
      </p>
      <div
        aria-hidden
        className="grid min-w-0 gap-6 lg:-my-6 lg:-mr-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr]"
      >
        <div className="flex min-w-0 flex-col gap-6 lg:pt-6">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:gap-x-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <TextBar className="text-xs" width="w-16 sm:w-36" />
                <Skeleton className="h-5 w-24" />
              </div>
              <TextBar className="text-2xl" width="w-56" />
            </div>
            <div className="col-start-2 row-start-1 md:col-start-3">
              <Skeleton className="size-7" />
            </div>
            <Skeleton className="col-span-full h-8 w-full md:col-span-1 md:col-start-2 md:row-start-1 md:w-28" />
          </div>
          <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <TextBar width="w-28" />
            <TextBar width="w-40" />
            <span className="size-6 max-md:hidden" />
          </div>
          <div className="flex flex-col gap-0.5 border-l-2 py-2 pr-2 pl-3 text-xs">
            <TextBar className="text-[0.65rem]" width="w-10" />
            <div>
              <TextBar width="w-3/4" />
              <TextBar className="sm:hidden" width="w-1/2" />
            </div>
          </div>
        </div>
        <div className="contents lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:flex lg:h-[calc(100svh-3rem-1px)] lg:min-w-0 lg:flex-col lg:overflow-y-auto lg:border-l lg:bg-muted/40">
          <div className="-mx-4 min-w-0 bg-muted/40 lg:mx-0 lg:bg-transparent">
            <div className="flex flex-col gap-1 px-4 py-6">
              <TextBar className="text-xs" width="w-24" />
              <TextBar className="text-3xl" width="w-32" />
              <Skeleton className="mt-2 h-8 w-full" />
            </div>
            <div className="flex min-w-0 flex-col gap-3 p-4">
              <SectionHeading title="Cuenta" />
              <dl className="flex flex-col gap-2 text-xs">
                {["Subtotal", "Descuento", "Total", "Pagado"].map((label) => (
                  <div
                    key={label}
                    className={cn("flex justify-between gap-x-2", label === "Descuento" && "py-px")}
                  >
                    <dt className={cn(label === "Total" && "font-medium")}>{label}</dt>
                    <dd>
                      <Skeleton className="inline-block h-lh w-14 align-top" />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="-mx-4 flex flex-col gap-3 px-4 max-lg:order-last lg:mx-0 lg:border-t lg:py-4">
            <SectionHeading
              title="Huéspedes"
              action={
                <Button variant="ghost" size="xs" disabled>
                  <PlusIcon data-icon="inline-start" />
                  Agregar huésped
                </Button>
              }
            />
            <div className="flex items-center gap-2.5 py-2 text-xs">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col">
                <TextBar width="w-36" />
                <TextBar width="w-24" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-10 lg:pb-6">
          <div className="flex min-w-0 flex-col gap-3">
            <SectionHeading
              title="Estadía"
              action={
                <Button variant="outline" size="sm" disabled>
                  <PencilIcon data-icon="inline-start" />
                  Editar estadía
                </Button>
              }
            />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="flex min-w-0 flex-col">
                <TextBar className="text-3xl" width="w-24 sm:w-28" />
                <TextBar className="text-xs" width="w-24" />
              </div>
              <div className="flex flex-col items-center gap-1.5 text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-px w-6 bg-border sm:w-16" />
                  <MoonIcon className="size-3.5" />
                  <span className="h-px w-6 bg-border sm:w-16" />
                </span>
                <TextBar width="w-14" />
              </div>
              <div className="flex min-w-0 flex-col items-end">
                <TextBar className="text-right text-3xl" width="w-24 sm:w-28" />
                <TextBar className="text-right text-xs" width="w-24" />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className={factLabel}>Ocupantes</dt>
                <dd>
                  <TextBar className="text-sm" width="w-20" />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                <dt className={factLabel}>Tarifa</dt>
                <dd>
                  <TextBar className="text-sm" width="w-16" />
                </dd>
              </div>
            </dl>
            <div className="pt-2">
              <div className="flex min-w-0 border">
                <div className="flex w-20 shrink-0 items-center justify-center border-r border-dashed bg-muted/40 text-xl sm:w-24 sm:text-2xl">
                  <TextBar width="w-12" />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <TextBar className="text-sm" width="w-20" />
                    <TextBar className="text-xs" width="w-32" />
                  </div>
                  <TextBar className="shrink-0 text-sm" width="w-14" />
                </div>
              </div>
            </div>
          </div>
          <div className="@container/mov flex min-w-0 flex-col gap-3">
            <SectionHeading title="Movimientos" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Movimiento</TableHead>
                  <TableHead className="@max-sm/mov:hidden">Método</TableHead>
                  <TableHead className="@max-lg/mov:hidden">Referencia</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <Skeleton className="inline-block h-lh w-20 align-top" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="inline-block h-lh w-10 align-top" />
                  </TableCell>
                  <TableCell className="@max-sm/mov:hidden">
                    <Skeleton className="inline-block h-lh w-16 align-top" />
                  </TableCell>
                  <TableCell className="@max-lg/mov:hidden">
                    <Skeleton className="inline-block h-lh w-20 align-top" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="inline-block h-lh w-14 align-top" />
                  </TableCell>
                  <TableCell>
                    <span className="block size-7" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
