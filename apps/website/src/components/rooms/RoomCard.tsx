import { useEffect, useState, type ReactNode } from "react";
import {
  BedIcon,
  CallBellIcon,
  ElevatorIcon,
  FrameCornersIcon,
  GarageIcon,
  type Icon,
  InfoIcon,
  MountainsIcon,
  ShowerIcon,
  TelevisionSimpleIcon,
  TowelIcon,
  UsersIcon,
  WifiHighIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import type { Lang } from "@/i18n/utils";
import type { StayDetailId } from "@/lib/included";
import { fill, formatDate } from "@/lib/reservation/format";
import type { RoomTypeOffers } from "@/lib/reservation/offers";
import { RoomGallery } from "./RoomGallery";
import type { RoomView } from "./RoomsBooking";
import type { RoomsBookingText } from "./text";

export type StayDetail = { id: StayDetailId; label: string };

/** What every room shares; each room's details list it, so the cards don't repeat it. */
export type StayDetails = {
  inRoom: StayDetail[];
  hotel: StayDetail[];
};

const detailIcons = {
  bathroom: ShowerIcon,
  towels: TowelIcon,
  tv: TelevisionSimpleIcon,
  wifi: WifiHighIcon,
  views: MountainsIcon,
  reception: CallBellIcon,
  elevator: ElevatorIcon,
  parking: GarageIcon,
} satisfies Record<StayDetailId, Icon>;

/** Three cards across; fewer rooms keep the same card width, centered. */
const gridColumns: Record<number, string> = {
  1: "md:grid-cols-[minmax(0,26rem)] md:justify-center",
  2: "md:grid-cols-2 lg:grid-cols-[repeat(2,calc((100%-3rem)/3))] lg:justify-center",
};

export function roomGridColumns(count: number) {
  return gridColumns[count] ?? "md:grid-cols-2 lg:grid-cols-3";
}

type Fact = { icon: Icon; label: string };

const eyebrow = "font-source-sans-3 text-xs font-medium tracking-widest uppercase";

/** A room's photos and facts, side by side with the other rooms; `children` is its price or action. */
export function RoomCard({
  room,
  lang,
  text,
  details,
  offers,
  preferred,
  children,
}: {
  room: RoomView;
  lang: Lang;
  text: RoomsBookingText;
  details: StayDetails;
  /** The search's limits and rates for this room; absent before a search. */
  offers?: RoomTypeOffers;
  preferred: boolean;
  children: ReactNode;
}) {
  const nameId = `room-${room.id}-name`;
  const freeUntil = offers?.offers.find(
    (offer) => offer.cancellation.freeCancellation === "available",
  )?.cancellation.freeUntil;
  const facts: Fact[] = [
    { icon: FrameCornersIcon, label: room.area },
    {
      icon: UsersIcon,
      label: fill(text["rooms.card.sleeps"], { count: offers?.maxAdults ?? room.sleeps }),
    },
    { icon: BedIcon, label: room.beds },
  ];

  return (
    <article
      aria-labelledby={nameId}
      className="flex h-full flex-col border border-stone-200 bg-white"
    >
      {/* The badge sits over the photo so every card's photo starts at the same height. */}
      <div className="relative">
        {preferred && (
          <p className="absolute top-0 left-0 z-10 bg-accent-500 px-3 py-1.5 font-source-sans-3 text-xs font-semibold tracking-widest text-accent-950 uppercase">
            {text["reservation.room.preferred"]}
          </p>
        )}
        {room.photos.length > 0 && (
          <RoomGallery room={room.name} photos={room.photos} text={text} />
        )}
      </div>
      <div
        className={`flex grow flex-col p-5 ${preferred && room.photos.length === 0 ? "pt-12" : ""}`}
      >
        <h2 id={nameId} className="text-xl font-semibold text-pretty text-stone-900">
          {room.name}
        </h2>
        <FactList facts={[...facts, { icon: WifiHighIcon, label: text["rooms.card.wifi"] }]} />
        {freeUntil && (
          <p className="mt-4 text-sm font-semibold text-green-800">
            {fill(text["rooms.card.freeUntil"], {
              date: formatDate(freeUntil, lang, { includeWeekday: false }),
            })}
          </p>
        )}
        <RoomDetails room={room} facts={facts} text={text} details={details} />
        <div className="mt-auto pt-6">{children}</div>
      </div>
    </article>
  );
}

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-2.5 text-stone-800">
      {facts.map(({ icon: FactIcon, label }) => (
        <li key={label} className="flex items-center gap-3">
          <FactIcon aria-hidden="true" className="size-5 shrink-0 text-accent-700" />
          {label}
        </li>
      ))}
    </ul>
  );
}

function DetailList({ title, items }: { title: string; items: StayDetail[] }) {
  return (
    <section className="mt-8">
      <h3 className={`${eyebrow} text-accent-700`}>{title}</h3>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => {
          const ItemIcon = detailIcons[item.id];
          return (
            <li key={item.id} className="flex items-start gap-3">
              <ItemIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-700" />
              {item.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const detailsTrigger =
  "mt-5 inline-flex cursor-pointer items-center gap-2 self-start font-source-sans-3 text-xs font-semibold tracking-widest text-stone-900 uppercase underline decoration-accent-500 decoration-2 underline-offset-[6px] hover:text-accent-800";

/** The room's facts and what every room shares: a dialog, or a bottom drawer on phones. */
function RoomDetails({
  room,
  facts,
  text,
  details,
}: {
  room: RoomView;
  facts: Fact[];
  text: RoomsBookingText;
  details: StayDetails;
}) {
  const mobile = useNarrowScreen();
  const trigger = (
    <>
      <InfoIcon aria-hidden="true" className="size-4 text-accent-700" />
      {text["rooms.details.open"]}
    </>
  );
  const body = (
    <>
      <FactList facts={facts} />
      <DetailList title={text["rooms.included.title"]} items={details.inRoom} />
      <DetailList title={text["rooms.hotel.title"]} items={details.hotel} />
    </>
  );
  const close = <XIcon aria-hidden="true" />;
  const title = "text-2xl font-semibold text-pretty text-stone-900";

  if (mobile)
    return (
      <Drawer showSwipeHandle>
        <DrawerTrigger className={detailsTrigger}>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[calc(100dvh-1rem)] bg-white text-base text-stone-800 motion-reduce:transition-none">
          <DrawerHeader className="flex-row items-center justify-between gap-3 px-5 text-left">
            <DrawerTitle className={title}>{room.name}</DrawerTitle>
            <DrawerClose
              aria-label={text["rooms.details.close"]}
              render={<Button variant="ghost" size="icon" className="size-11 shrink-0" />}
            >
              {close}
            </DrawerClose>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );

  return (
    <Dialog>
      <DialogTrigger className={detailsTrigger}>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[85dvh] gap-0 overflow-y-auto bg-white p-8 text-base text-stone-800 sm:max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className={title}>{room.name}</DialogTitle>
          <DialogClose
            aria-label={text["rooms.details.close"]}
            render={<Button variant="ghost" size="icon" className="-mt-2 -mr-3 size-11 shrink-0" />}
          >
            {close}
          </DialogClose>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/** Below the `md` breakpoint, matching the stay search's drawer. */
function useNarrowScreen() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 48rem)");
    const update = () => setNarrow(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}
