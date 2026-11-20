<script lang="ts">
  import {
    Carousel,
    CarouselContent,
    CarouselIndicator,
    CarouselIndicatorGroup,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    CarouselViewport,
    createCarouselController,
  } from "@ui-sdk/svelte/carousel";
  import { DialogClose } from "@ui-sdk/svelte/dialog";
  import { fill } from "@/lib/reservation/format";
  import RoomIcon from "./RoomIcon.svelte";
  import type { RoomPhotoView } from "./room-view";
  import type { RoomsBookingText } from "./text";

  let {
    room,
    photos,
    text,
    controller,
    start = 1,
    fullscreen = false,
    onOpen,
    onPage,
    onPageComplete,
  }: {
    room: string;
    photos: RoomPhotoView[];
    text: RoomsBookingText;
    controller?: ReturnType<typeof createCarouselController>;
    start?: number;
    fullscreen?: boolean;
    onOpen?: (page: number) => void;
    onPage?: (page: number) => void;
    onPageComplete?: (page: number) => void;
  } = $props();

  let selected = $state<number>();
  let loaded = $state.raw(new Set<number>());
  const page = $derived(selected ?? start);
  const current = $derived(photos[page - 1]);
  const position = (page: number) => `${page} ${text["rooms.gallery.of"]} ${photos.length}`;
  const arrow =
    "absolute top-1/2 -translate-y-1/2 flex items-center justify-center cursor-pointer size-11 bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-0 pointer-fine:opacity-0 pointer-fine:pointer-events-none pointer-fine:group-hover:opacity-100 pointer-fine:group-hover:pointer-events-auto pointer-fine:focus-visible:opacity-100 pointer-fine:focus-visible:pointer-events-auto";

  function reveal(page: number) {
    if (!loaded.has(page)) loaded = new Set([...loaded, page]);
  }

  function watchSlide(element: HTMLElement, page: number) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.1) {
          reveal(page);
          observer.disconnect();
        }
      },
      { root: element.closest('[data-slot="carousel-viewport"]'), threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }
</script>

<Carousel
  {controller}
  defaultPage={start}
  loop
  aria-label={fill(text["rooms.gallery.label"], { room })}
  class={["group relative", fullscreen && "h-dvh"]}
  onPageChange={(page) => {
    selected = page;
    reveal(page);
    onPage?.(page);
  }}
  onPageChangeComplete={onPageComplete}
>
  <CarouselViewport class="scrollbar-none">
    <CarouselContent>
      {#each photos as photo, index (photo.src)}
        {@const number = index + 1}
        {@const shown = number === start || loaded.has(number)}
        <CarouselItem aria-label={position(number)}>
          {#if fullscreen}
            <div
              class="relative flex h-dvh items-center justify-center pt-[max(4rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(4rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] md:px-20"
              {@attach (element) => watchSlide(element, number)}
            >
              <DialogClose
                class="absolute inset-0 cursor-default"
                aria-hidden="true"
                tabindex={-1}
              />
              {#if shown}
                <img
                  class="relative h-auto max-h-full w-auto max-w-full object-contain"
                  src={photo.full}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.alt}
                  decoding="async"
                />
              {/if}
            </div>
          {:else}
            <button
              type="button"
              data-photo={number}
              class="block aspect-video w-full cursor-zoom-in overflow-hidden bg-stone-200"
              aria-label={`${room}: ${text["rooms.gallery.open"]} ${position(number)}`}
              onclick={() => onOpen?.(number)}
              {@attach (element) => watchSlide(element, number)}
            >
              {#if shown}
                <img
                  class="h-full w-full object-cover object-center"
                  src={photo.src}
                  srcset={photo.srcSet}
                  sizes={photo.sizes}
                  width={photo.width}
                  height={photo.height}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                />
              {/if}
            </button>
          {/if}
        </CarouselItem>
      {/each}
    </CarouselContent>
  </CarouselViewport>
  {#if fullscreen}
    <DialogClose
      data-lightbox-close
      class="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex h-11 min-w-11 cursor-pointer items-center justify-center bg-white/10 px-3 font-source-sans-3 text-sm tracking-widest uppercase hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
    >
      {text["rooms.gallery.close"]}
    </DialogClose>
  {/if}
  {#if photos.length > 1}
    <CarouselPrevious
      class={[
        arrow,
        fullscreen ? "left-[max(0.75rem,env(safe-area-inset-left))] md:left-6" : "left-3",
      ]}
      aria-label={text["rooms.gallery.previous"]}
    >
      <RoomIcon name="previous" class="size-5" />
    </CarouselPrevious>
    <CarouselNext
      class={[
        arrow,
        fullscreen ? "right-[max(0.75rem,env(safe-area-inset-right))] md:right-6" : "right-3",
      ]}
      aria-label={text["rooms.gallery.next"]}
    >
      <RoomIcon name="next" class="size-5" />
    </CarouselNext>
    <CarouselIndicatorGroup
      aria-label={fill(text["rooms.gallery.label"], { room })}
      class={[
        "absolute left-1/2 flex -translate-x-1/2",
        fullscreen ? "bottom-[max(0.75rem,env(safe-area-inset-bottom))]" : "bottom-2",
      ]}
    >
      {#each photos as photo, index (photo.src)}
        <CarouselIndicator
          page={index + 1}
          data-photo-dot={index + 1}
          class="group/dot flex size-8 cursor-pointer touch-manipulation items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label={fill(text["rooms.gallery.show"], { position: position(index + 1) })}
        >
          <span
            aria-hidden="true"
            class={[
              "size-2 border transition-colors motion-reduce:transition-none",
              page === index + 1
                ? "border-accent-500 bg-accent-500 group-hover/dot:border-accent-400 group-hover/dot:bg-accent-400"
                : "border-white bg-black/40 group-hover/dot:bg-white",
            ]}
          ></span>
        </CarouselIndicator>
      {/each}
    </CarouselIndicatorGroup>
  {/if}
  {#if fullscreen && current}
    <p class="sr-only" aria-live="polite" aria-atomic="true">
      {`${room}: ${current.alt}, ${position(page)}`}
    </p>
  {/if}
</Carousel>
