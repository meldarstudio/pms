<script lang="ts">
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog";
  import type { Snippet } from "svelte";
  import { fill } from "@/lib/reservation/format";
  import type { RoomTypeOffers } from "@/lib/reservation/offers";
  import RoomGallery from "./RoomGallery.svelte";
  import RoomIcon from "./RoomIcon.svelte";
  import type { RoomView, StayDetail, StayDetails } from "./room-view";
  import type { RoomsBookingText } from "./text";

  let {
    room,
    text,
    details,
    offers,
    children,
  }: {
    room: RoomView;
    text: RoomsBookingText;
    details: StayDetails;
    offers?: RoomTypeOffers;
    children: Snippet;
  } = $props();

  const nameId = $derived(`room-${room.id}-name`);
  const facts = $derived([
    { id: "area", label: room.area },
    {
      id: "guests",
      label: fill(text["rooms.card.sleeps"], { count: offers?.maxAdults ?? room.sleeps }),
    },
    { id: "beds", label: room.beds },
  ] as const);
  type Fact = (typeof facts)[number] | { id: "wifi"; label: string };
</script>

{#snippet factList(items: readonly Fact[], compact = false)}
  <ul
    class={[
      "mt-4 text-stone-800",
      compact
        ? "grid grid-cols-2 gap-x-3 gap-y-2 text-sm [&>li]:gap-2 [&>li>svg]:size-4"
        : "flex flex-col gap-2.5 [&>li]:gap-3 [&>li>svg]:size-5",
    ]}
  >
    {#each items as fact (fact.id)}
      <li class="flex items-center">
        <RoomIcon name={fact.id} class="shrink-0 text-accent-700" />
        {fact.label}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet detailList(title: string, items: StayDetail[])}
  <section class="mt-8">
    <h3 class="font-source-sans-3 text-xs font-medium tracking-widest uppercase text-accent-700">
      {title}
    </h3>
    <ul class="mt-3 flex flex-col gap-3">
      {#each items as item (item.id)}
        <li class="flex items-start gap-3">
          <RoomIcon name={item.id} class="mt-0.5 size-5 shrink-0 text-accent-700" />
          {item.label}
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

<article aria-labelledby={nameId} class="flex h-full flex-col border border-stone-200 bg-white">
  {#if room.photos.length}
    <RoomGallery room={room.name} photos={room.photos} {text} />
  {/if}
  <div class="flex grow flex-col p-5">
    <h2 id={nameId} class="text-xl font-semibold text-pretty text-stone-900">{room.name}</h2>
    {@render factList([...facts, { id: "wifi", label: text["rooms.card.wifi"] }], true)}
    <Dialog presentation="auto">
      <DialogTrigger
        class="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start font-source-sans-3 text-xs font-semibold tracking-widest text-stone-900 uppercase underline decoration-accent-500 decoration-2 underline-offset-[6px] hover:text-accent-800"
      >
        <RoomIcon name="info" class="size-4 text-accent-700" />
        {text["rooms.details.open"]}
      </DialogTrigger>
      <DialogBackdrop class="fixed inset-0 bg-black/40" />
      <DialogContent class="room-details-dialog bg-white text-base text-stone-800">
        <div class="flex items-start justify-between gap-3">
          <DialogTitle class="text-2xl font-semibold text-pretty text-stone-900">
            {room.name}
          </DialogTitle>
          <DialogClose
            class="-mt-2 -mr-3 flex size-11 shrink-0 cursor-pointer items-center justify-center hover:bg-stone-100"
            aria-label={text["rooms.details.close"]}
          >
            <RoomIcon name="close" class="size-5" />
          </DialogClose>
        </div>
        <div class="room-details-body">
          {@render factList(facts)}
          {@render detailList(text["rooms.included.title"], details.inRoom)}
          {@render detailList(text["rooms.hotel.title"], details.hotel)}
        </div>
      </DialogContent>
    </Dialog>
    <div class="mt-auto pt-4">{@render children()}</div>
  </div>
</article>

<style>
  :global(.room-details-dialog) {
    width: min(32rem, calc(100vw - 2rem));
    max-height: 85dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2rem;
  }

  :global(.room-details-dialog[data-presentation="sheet"]) {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: calc(100dvh - 1rem);
    overflow: clip;
    padding: 1.5rem 1.25rem 0;
  }

  :global(.room-details-dialog[data-presentation="sheet"]) .room-details-body {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  }

  :global(.room-details-dialog[data-presentation="sheet"])::before {
    content: "";
    display: block;
    flex: none;
    width: 3rem;
    height: 0.25rem;
    margin: -1rem auto 1rem;
    background: var(--color-stone-200);
  }
</style>
