import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "cn";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
  useCarousel,
} from "@/components/ui/carousel";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fill } from "@/lib/reservation/format";
import type { RoomsBookingText } from "./text";

export type RoomPhotoView = {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
  alt: string;
  /** Large image for the lightbox, loaded only once it opens. */
  full: string;
};

type GalleryText = Pick<
  RoomsBookingText,
  | "rooms.gallery.label"
  | "rooms.gallery.open"
  | "rooms.gallery.show"
  | "rooms.gallery.of"
  | "rooms.gallery.previous"
  | "rooms.gallery.next"
  | "rooms.gallery.close"
>;

const overlayButton =
  "size-11 rounded-none border-0 bg-black/50 text-white hover:bg-black/70 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-0 pointer-fine:opacity-0 pointer-fine:pointer-events-none pointer-fine:group-hover:opacity-100 pointer-fine:group-hover:pointer-events-auto pointer-fine:focus-visible:opacity-100 pointer-fine:focus-visible:pointer-events-auto [&_svg:not([class*='size-'])]:size-5";

function useSelectedSlide(api: CarouselApi) {
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelected(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);
  return selected;
}

function GalleryDots({
  photos,
  text,
  fullscreen = false,
}: {
  photos: RoomPhotoView[];
  text: GalleryText;
  fullscreen?: boolean;
}) {
  const { api } = useCarousel();
  const selected = useSelectedSlide(api);

  if (photos.length <= 1) return null;

  return (
    <div
      className={cn(
        "absolute left-1/2 flex -translate-x-1/2",
        fullscreen ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))]" : "bottom-2",
      )}
    >
      {photos.map((photo, index) => (
        <button
          key={photo.src}
          type="button"
          className="group/dot flex size-8 cursor-pointer touch-manipulation items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label={fill(text["rooms.gallery.show"], {
            position: `${index + 1} ${text["rooms.gallery.of"]} ${photos.length}`,
          })}
          aria-current={selected === index ? "true" : undefined}
          onClick={() => api?.scrollTo(index)}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 border transition-colors motion-reduce:transition-none",
              selected === index
                ? "border-accent-500 bg-accent-500 group-hover/dot:border-accent-400 group-hover/dot:bg-accent-400"
                : "border-white bg-black/40 group-hover/dot:bg-white",
            )}
          />
        </button>
      ))}
    </div>
  );
}

/** Swipeable room photos; each photo opens a full-screen lightbox at that photo. */
export function RoomGallery({
  room,
  photos,
  text,
}: {
  room: string;
  photos: RoomPhotoView[];
  text: GalleryText;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const viewed = useRef(0);
  const photoButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const position = (index: number) => `${index + 1} ${text["rooms.gallery.of"]} ${photos.length}`;

  return (
    <>
      <Carousel
        setApi={setApi}
        opts={{ loop: true }}
        aria-label={fill(text["rooms.gallery.label"], { room })}
        className="group"
      >
        <CarouselContent className="ml-0">
          {photos.map((photo, index) => (
            <CarouselItem key={photo.src} className="pl-0" aria-label={position(index)}>
              <button
                type="button"
                ref={(button) => {
                  photoButtons.current[index] = button;
                }}
                className="block aspect-4/3 w-full cursor-zoom-in overflow-hidden bg-stone-200"
                aria-label={`${room}: ${text["rooms.gallery.open"]} ${position(index)}`}
                onClick={() => {
                  viewed.current = index;
                  setLightbox(index);
                }}
              >
                <img
                  className="h-full w-full object-cover object-center"
                  src={photo.src}
                  srcSet={photo.srcSet}
                  sizes={photo.sizes}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.alt}
                  loading={index === 0 ? undefined : "lazy"}
                  decoding="async"
                />
              </button>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          className={`left-3 ${overlayButton}`}
          aria-label={text["rooms.gallery.previous"]}
        />
        <CarouselNext
          className={`right-3 ${overlayButton}`}
          aria-label={text["rooms.gallery.next"]}
        />
        <GalleryDots photos={photos} text={text} />
      </Carousel>
      <Dialog
        open={lightbox !== null}
        onOpenChange={(open) => {
          if (open) return;
          api?.scrollTo(viewed.current, true);
          setLightbox(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          finalFocus={() => photoButtons.current[viewed.current] ?? true}
          className="inset-0 top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 overscroll-contain bg-stone-950 p-0 text-white ring-0 sm:max-w-none data-closed:zoom-out-100 data-open:zoom-in-100"
        >
          <DialogTitle className="sr-only">{room}</DialogTitle>
          {lightbox !== null && (
            <Lightbox
              room={room}
              photos={photos}
              start={lightbox}
              text={text}
              onView={(index) => {
                viewed.current = index;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Lightbox({
  room,
  photos,
  start,
  text,
  onView,
}: {
  room: string;
  photos: RoomPhotoView[];
  start: number;
  text: GalleryText;
  onView: (index: number) => void;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const selected = useSelectedSlide(api);
  const close = useRef<HTMLButtonElement>(null);
  const photo = photos[selected] ?? photos[0]!;
  const position = `${selected + 1} ${text["rooms.gallery.of"]} ${photos.length}`;

  useEffect(() => {
    onView(selected);
  }, [selected, onView]);
  useEffect(() => {
    close.current?.focus();
  }, []);

  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close.current?.click();
  };

  return (
    <Carousel
      setApi={setApi}
      opts={{ loop: true, startIndex: start }}
      aria-label={fill(text["rooms.gallery.label"], { room })}
      className="group h-dvh"
    >
      <CarouselContent className="ml-0">
        {photos.map((item, index) => (
          <CarouselItem
            key={item.full}
            className="flex h-dvh items-center justify-center pt-[max(4rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(4rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] md:px-20"
            aria-label={`${index + 1} ${text["rooms.gallery.of"]} ${photos.length}`}
            onClick={closeOnBackdrop}
          >
            <img
              className="h-auto max-h-full w-auto max-w-full object-contain"
              src={item.full}
              width={item.width}
              height={item.height}
              alt={item.alt}
              decoding="async"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <DialogClose
        ref={close}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex h-11 min-w-11 cursor-pointer items-center justify-center bg-white/10 px-3 font-source-sans-3 text-sm tracking-widest uppercase hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
      >
        {text["rooms.gallery.close"]}
      </DialogClose>
      <CarouselPrevious
        className={`left-[max(0.75rem,env(safe-area-inset-left))] md:left-6 ${overlayButton} size-12`}
        aria-label={text["rooms.gallery.previous"]}
      />
      <CarouselNext
        className={`right-[max(0.75rem,env(safe-area-inset-right))] md:right-6 ${overlayButton} size-12`}
        aria-label={text["rooms.gallery.next"]}
      />
      <GalleryDots photos={photos} text={text} fullscreen />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`${room}: ${photo.alt}, ${position}`}
      </p>
    </Carousel>
  );
}
