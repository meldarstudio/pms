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
  let returningToPage: number | undefined;

  function open(page: number) {
    returningToPage = undefined;
    start = viewed = page;
    lightbox = true;
  }

  function followLightbox(page: number) {
    viewed = page;
    if (card.setPage(page)) returningToPage = page;
  }

  function change(open: boolean) {
    lightbox = open;
    if (!open && card.setPage(viewed)) returningToPage = viewed;
  }

  function finalFocus() {
    return (
      gallery.querySelector<HTMLElement>(
        `[data-slot="carousel-item"]:not([inert]) [data-photo="${viewed}"]`,
      ) ?? gallery.querySelector<HTMLElement>(`[data-photo-dot="${viewed}"]`)
    );
  }

  function focusViewed(page: number) {
    const returning = page === returningToPage;
    returningToPage = undefined;
    if (!returning || lightbox) return;
    const dot = gallery.querySelector(`[data-photo-dot="${page}"]`);
    if (document.activeElement === dot)
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
    class="room-lightbox h-dvh w-screen max-w-none overscroll-contain bg-stone-950 text-white"
  >
    <DialogTitle class="sr-only">{room}</DialogTitle>
    {#if lightbox}
      <PhotoCarousel
        {room}
        {photos}
        {text}
        {start}
        fullscreen
        onPage={followLightbox}
      />
    {/if}
  </DialogContent>
</Dialog>

<style>
  :global(.room-lightbox::backdrop) {
    background: transparent;
  }

  :global(.room-lightbox[data-open]) {
    transition: opacity 220ms var(--booking-ease-out);
  }

  :global(.room-lightbox[data-starting-style]) {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.room-lightbox[data-open]) {
      transition-duration: 80ms;
    }
  }
</style>
