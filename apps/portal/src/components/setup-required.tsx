import { Link } from "@tanstack/react-router";
import { BedDoubleIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type MissingSetup = "types" | "rooms";

const copy = {
  types: {
    title: "Configura tu alojamiento",
    description:
      "Agrega tus tipos de habitación y habitaciones en Configuración para empezar a recibir reservas.",
  },
  rooms: {
    title: "Aún no hay habitaciones",
    description:
      "Agrega habitaciones a tus tipos en Configuración para empezar a recibir reservas.",
  },
} satisfies Record<MissingSetup, { title: string; description: string }>;

export function SetupRequired({ missing }: { missing: MissingSetup }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BedDoubleIcon />
        </EmptyMedia>
        <EmptyTitle>{copy[missing].title}</EmptyTitle>
        <EmptyDescription>{copy[missing].description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/setup" className={buttonVariants({ variant: "outline" })}>
          Ir a Configuración
        </Link>
      </EmptyContent>
    </Empty>
  );
}
