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
    action: "Configurar alojamiento",
  },
  rooms: {
    title: "Aún no hay habitaciones",
    description:
      "Agrega habitaciones a tus tipos en Configuración para empezar a recibir reservas.",
    action: "Agregar habitaciones",
  },
} satisfies Record<MissingSetup, { title: string; description: string; action: string }>;

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
        <Link to="/setup" className={buttonVariants()}>
          {copy[missing].action}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
