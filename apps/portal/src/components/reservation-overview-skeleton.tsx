import { ChevronUpIcon, MailIcon, PencilIcon, PhoneIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { SectionHeading } from "@/components/reservation-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReservationLayout } from "@/components/reservation-layout";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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

const factLabel = "text-xs text-muted-foreground";

export function ReservationOverviewSkeleton() {
  const mobile = useIsMobile();
  const { stacked, tablet } = useReservationLayout();
  if (mobile) return <MobileReservationSkeleton />;
  return (
    <div aria-busy className="min-w-0">
      <p role="status" className="sr-only">
        Cargando reserva…
      </p>
      <div
        aria-hidden
        className="grid min-w-0 gap-6 md:gap-8 group-data-[layout=columns]/reservation:-my-6 group-data-[layout=columns]/reservation:-mr-6 group-data-[layout=columns]/reservation:grid-cols-[minmax(0,1fr)_24rem] group-data-[layout=columns]/reservation:grid-rows-[auto_1fr] group-data-tablet/reservation:group-data-[layout=columns]/reservation:grid-cols-[minmax(0,1fr)_18rem]"
      >
        <div className="flex min-w-0 flex-col gap-6 md:gap-4 group-data-[layout=columns]/reservation:pt-6">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 md:gap-x-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <TextBar className="text-xs" width="w-16 sm:w-36" />
                <Skeleton className={cn(stacked ? "h-5" : "h-6", "w-24")} />
              </div>
              <TextBar className="text-2xl" width="w-56" />
            </div>
            <div className={cn("col-start-2 row-start-1", !stacked && "md:col-start-3")}>
              <Skeleton className={tablet ? "size-(--control-h-lg)" : "size-(--control-h)"} />
            </div>
            {!stacked && (
              <Skeleton
                className={cn(
                  "col-start-2 row-start-1 w-28",
                  tablet ? "h-(--control-h-lg)" : "h-(--control-h)",
                )}
              />
            )}
          </div>
          <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:-mt-2">
            <TextBar width="w-28" />
            <TextBar width="w-40" />
            <span
              className={cn(
                "shrink-0",
                stacked || tablet ? "size-(--control-h-lg)" : "size-(--control-h-xs)",
              )}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 border-l-2 pl-3">
            <span className="text-xs font-medium text-muted-foreground">Notas para el equipo</span>
            <div className="text-sm">
              <TextBar width="w-3/4" />
              <TextBar className="sm:hidden" width="w-1/2" />
            </div>
          </div>
          {stacked && <Separator />}
        </div>
        <div className="contents group-data-[layout=columns]/reservation:sticky group-data-[layout=columns]/reservation:top-0 group-data-[layout=columns]/reservation:col-start-2 group-data-[layout=columns]/reservation:row-span-2 group-data-[layout=columns]/reservation:row-start-1 group-data-[layout=columns]/reservation:flex group-data-[layout=columns]/reservation:h-[calc(100svh-3rem-1px)] group-data-[layout=columns]/reservation:min-w-0 group-data-[layout=columns]/reservation:flex-col group-data-[layout=columns]/reservation:overflow-y-auto group-data-[layout=columns]/reservation:border-l group-data-[layout=columns]/reservation:bg-muted/40">
          {!stacked && (
            <div className="min-w-0 bg-transparent">
              <div className="flex flex-col gap-1 px-6 pt-6 pb-5">
                <TextBar className="text-xs" width="w-24" />
                <TextBar className="text-2xl" width="w-32" />
                <Skeleton
                  className={cn("mt-2 w-full", tablet ? "h-(--control-h-lg)" : "h-(--control-h)")}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-3 px-6 pb-5">
                <SectionHeading title="Cuenta" />
                <dl className="flex flex-col gap-2 text-xs">
                  {["Subtotal", "Descuento", "Total", "Pagado"].map((label) => (
                    <div
                      key={label}
                      className={cn(
                        "flex justify-between gap-x-2",
                        label === "Descuento" &&
                          "items-center pointer-coarse:min-h-(--control-h-xs)",
                      )}
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
          )}
          <div className="-mx-4 flex min-w-0 flex-col gap-3 px-4 group-data-[layout=stacked]/reservation:order-last group-data-[layout=columns]/reservation:mx-0 group-data-[layout=columns]/reservation:border-t group-data-[layout=columns]/reservation:px-6 group-data-[layout=columns]/reservation:py-5">
            <SectionHeading
              title="Huéspedes"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  className="max-xl:min-h-(--control-h-lg)"
                  disabled
                >
                  <PlusIcon data-icon="inline-start" />
                  Agregar huésped
                </Button>
              }
            />
            {stacked || tablet ? (
              <Empty className="flex-none border">
                <EmptyHeader className="w-full">
                  <Skeleton className="mb-2 size-(--control-h)" />
                  <EmptyTitle>
                    <TextBar width="w-52" />
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex items-center gap-2.5 py-2 text-xs">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <TextBar width="w-36" />
                  <TextBar width="w-24" />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-8 group-data-[layout=columns]/reservation:pb-6">
          <div className="flex min-w-0 flex-col gap-3">
            <SectionHeading
              title="Estadía"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  className="max-xl:min-h-(--control-h-lg)"
                  disabled
                >
                  <PencilIcon data-icon="inline-start" />
                  Editar estadía
                </Button>
              }
            />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs text-muted-foreground">Ingreso</p>
                <TextBar className="text-xl font-medium" width="w-18" />
                <TextBar className="text-xs" width="w-24" />
              </div>
              <TextBar className="text-xs" width="w-14" />
              <div className="flex min-w-0 flex-col items-end gap-1">
                <p className="text-xs text-muted-foreground">Salida</p>
                <TextBar className="text-right text-xl font-medium" width="w-18" />
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
                  {!stacked && <TableHead className="w-10" />}
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
                  {!stacked && (
                    <TableCell>
                      <span className="block size-(--control-h-sm)" />
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      {stacked && (
        <>
          <AccountFooterSkeleton />
          <div
            aria-hidden
            className="h-[calc(1px+1.5rem+2*var(--control-h-lg)+max(1rem,env(safe-area-inset-bottom)))]"
          />
        </>
      )}
    </div>
  );
}

function MobileReservationSkeleton() {
  return (
    <div aria-busy className="min-w-0">
      <p role="status" className="sr-only">
        Cargando reserva…
      </p>
      <div aria-hidden className="flex min-w-0 flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <TextBar className="text-xs" width="w-22" />
                <Skeleton className="h-6 w-24" />
              </div>
              <TextBar className="text-2xl font-semibold" width="w-44" />
            </div>
            <Skeleton className="size-(--control-h-lg)" />
          </div>
          <div className="-mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4">
              <div className="inline-flex min-w-0 items-center gap-1.5">
                <PhoneIcon className="size-3.5" />
                <TextBar className="py-1.5" width="w-28" />
              </div>
              <div className="inline-flex min-w-0 items-center gap-1.5">
                <MailIcon className="size-3.5" />
                <TextBar className="py-1.5" width="w-42" />
              </div>
            </div>
            <Skeleton className="size-(--control-h-lg)" />
          </div>
          <div className="flex min-w-0 items-start gap-2 border-l-2 pl-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground">
                Notas para el equipo
              </span>
              <div className="text-sm">
                <TextBar width="w-full" />
                <TextBar width="w-44" />
              </div>
            </div>
          </div>
          <Separator />
        </div>
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex min-w-0 flex-col gap-3">
            <SectionHeading
              title="Estadía"
              action={
                <Button
                  variant="ghost"
                  size="xs"
                  className="max-md:min-h-(--control-h-lg)"
                  disabled
                >
                  <PencilIcon data-icon="inline-start" />
                  Editar estadía
                </Button>
              }
            />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs text-muted-foreground">Ingreso</p>
                <TextBar className="text-xl font-medium" width="w-18" />
                <TextBar className="text-xs" width="w-18" />
              </div>
              <TextBar className="text-xs" width="w-14" />
              <div className="flex min-w-0 flex-col items-end gap-1">
                <p className="text-xs text-muted-foreground">Salida</p>
                <TextBar className="text-xl font-medium" width="w-18" />
                <TextBar className="text-xs" width="w-18" />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-xs">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-muted-foreground">Ocupantes</dt>
                <dd>
                  <TextBar width="w-20" />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
                <dt className="text-muted-foreground">Tarifa</dt>
                <dd>
                  <TextBar width="w-16" />
                </dd>
              </div>
            </dl>
            <div className="pt-2">
              <div className="flex min-w-0 border">
                <div className="flex w-20 shrink-0 items-center justify-center border-r border-dashed bg-muted/40 text-xl font-semibold">
                  <TextBar width="w-8" />
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <TextBar className="text-sm font-medium" width="w-34" />
                    <TextBar className="text-xs" width="w-34" />
                  </div>
                  <TextBar className="shrink-0 text-sm font-medium" width="w-12" />
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
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <SectionHeading
            title="Huéspedes"
            action={
              <Button variant="ghost" size="xs" className="max-md:min-h-(--control-h-lg)" disabled>
                <PlusIcon data-icon="inline-start" />
                Agregar huésped
              </Button>
            }
          />
          <Empty className="border">
            <EmptyHeader className="w-full">
              <Skeleton className="mb-2 size-(--control-h)" />
              <EmptyTitle>
                <TextBar width="w-52" />
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        </div>
        <AccountFooterSkeleton />
      </div>
      <div
        aria-hidden
        className="h-[calc(1px+1.5rem+2*var(--control-h-lg)+max(1rem,env(safe-area-inset-bottom)))]"
      />
    </div>
  );
}

function AccountFooterSkeleton() {
  return (
    <div className="fixed inset-x-0 bottom-0 flex flex-col gap-3 border-t bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:right-auto md:left-(--reservation-content-left) md:w-(--reservation-content-width) md:px-6">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <TextBar className="text-xs font-medium" width="w-28" />
        <div className="flex items-center gap-2">
          <TextBar className="text-sm font-semibold" width="w-14" />
          <ChevronUpIcon className="size-4" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-(--control-h-lg)" />
        <Skeleton className="h-(--control-h-lg)" />
      </div>
    </div>
  );
}
