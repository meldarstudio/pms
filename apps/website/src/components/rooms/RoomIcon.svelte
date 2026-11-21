<script lang="ts">
  const paths = {
    bathroom: "M2 14v-3a4 4 0 0 1 8 0m-3 1h6M8 14v1m3-1v1m3-1v1",
    towels: "M5 13V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10l-2-1-2 1-2-1-2 1H4a1 1 0 0 1-1-1V6m4 3h4",
    tv: "M1 3h14v9H1zM5 15h6m-3-3v3",
    wifi: "M1 5a11 11 0 0 1 14 0M3 8a8 8 0 0 1 10 0m-8 3a5 5 0 0 1 6 0m-3 3h.01",
    views: "m1 13 5-10 5 10H1zm8-4 2-4 4 8h-4",
    reception: "M1 13h14M2 11a6 6 0 0 1 12 0H2Zm6-8v2",
    elevator: "M2 2h12v12H2zM8 5v6m-2-4 2-2 2 2m-4 2 2 2 2-2",
    parking: "M1 14V6l7-4 7 4v8M4 14V7h8v7M4 10h8",
    area: "M6 2H2v4m8-4h4v4M2 10v4h4m8-4v4h-4M6 10l4-4m-3 0h3v3",
    guests:
      "M10 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM2 14a5.5 5.5 0 0 1 11 0m-1-11a2.5 2.5 0 0 1 0 5m1 2a4 4 0 0 1 2 4",
    beds: "M1 13V4m14 9V8a2 2 0 0 0-2-2H7v5M1 11h14M5 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z",
    info: "M15 8a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM8 7v4m0-6h.01",
    close: "m4 4 8 8m0-8-8 8",
    down: "m4 6 4 4 4-4",
    previous: "m10 3-5 5 5 5",
    next: "m6 3 5 5-5 5",
    calendar: "M2 4h12v10H2zM2 7h12M5 2v3m6-3v3",
  } as const;
  let { name, class: className }: { name: keyof typeof paths; class?: string } = $props();
</script>

<svg
  aria-hidden="true"
  class={className}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d={paths[name]} />
</svg>
