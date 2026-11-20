<script lang="ts">
  import { createCarouselController } from "@ui-sdk/svelte/carousel";
  import { Dialog, DialogContent, DialogTitle } from "@ui-sdk/svelte/dialog";
  import PhotoCarousel from "./PhotoCarousel.svelte";
  import type { RoomPhotoView } from "./room-view";
  import type { RoomsBookingText } from "./text";

  let { room, photos, text }: { room: string; photos: RoomPhotoView[]; text: RoomsBookingText } =
    $props();
  const card = createCarouselController();
  let gallery: HTMLDivElement;
  let lightbox = $state(false);
  let start = $state(1);
  let viewed = 1;

  function open(page: number) {
    start = viewed = page;
    lightbox = true;
  }

  function change(open: boolean) {
    if (!open) card.setPage(viewed);
    lightbox = open;
  }

  function finalFocus() {
    return (
      gallery.querySelector<HTMLElement>(
        `[data-slot="carousel-item"]:not([inert]) [data-photo="${viewed}"]`,
      ) ?? gallery.querySelector<HTMLElement>(`[data-photo-dot="${viewed}"]`)
    );
  }

  function focusViewed(page: number) {
    const dot = gallery.querySelector(`[data-photo-dot="${page}"]`);
    if (!lightbox && document.activeElement === dot)
      gallery.querySelector<HTMLElement>(`[data-photo="${page}"]`)?.focus({ preventScroll: true });
  }
</script>

<div bind:this={gallery}>
  <PhotoCarousel
    {room}
    {photos}
    {text}
    controller={card}
    onOpen={open}
    onPageComplete={focusViewed}
  />
</div>
<Dialog open={lightbox} onOpenChange={change}>
  <DialogContent
    initialFocus="[data-lightbox-close]"
    {finalFocus}
    class="h-dvh w-screen max-w-none overscroll-contain bg-stone-950 text-white"
  >
    <DialogTitle class="sr-only">{room}</DialogTitle>
    {#if lightbox}
      <PhotoCarousel
        {room}
        {photos}
        {text}
        {start}
        fullscreen
        onPage={(page) => {
          viewed = page;
        }}
      />
    {/if}
  </DialogContent>
</Dialog>
