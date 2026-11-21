<script lang="ts">
  import type { BookingStepsText } from "./booking-steps";

  const order = ["room", "rate", "review"] as const;
  type BookingStep = (typeof order)[number];
  let {
    text,
    current,
    hrefs,
    onChangeRoom,
    id,
    class: className,
  }: {
    text: BookingStepsText;
    current: BookingStep;
    hrefs?: Partial<Record<BookingStep, string>>;
    onChangeRoom?: () => void;
    id?: string;
    class?: string;
  } = $props();

  const position = $derived(order.indexOf(current));
  const completedAction =
    "flex min-h-11 w-full cursor-pointer flex-col justify-start [&_[data-step-label]]:underline [&_[data-step-label]]:decoration-stone-300 [&_[data-step-label]]:underline-offset-4 hover:[&_[data-step-label]]:text-accent-800 hover:[&_[data-step-label]]:decoration-accent-500";
</script>

<nav {id} aria-label={text["reservation.steps"]} class={className}>
  <ol class="grid grid-cols-3 gap-2 md:gap-3">
    {#each order as step, index (step)}
      {@const done = index < position}
      {@const active = index === position}
      {@const href = hrefs?.[step]}
      {#snippet content()}
        <span
          aria-hidden="true"
          class={["block h-1 w-full", done || active ? "bg-accent-500" : "bg-stone-300"]}
        ></span>
        <span
          class={[
            "mt-3 flex items-center gap-1 text-left whitespace-nowrap md:gap-2 font-source-sans-3 text-xs tracking-wide uppercase md:tracking-widest",
            active
              ? "font-semibold text-accent-800"
              : done
                ? "font-medium text-stone-900"
                : "font-medium text-stone-600",
          ]}
        >
          {#if done}
            <svg
              aria-hidden="true"
              class="size-3 shrink-0 text-accent-700 md:size-3.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="m3 8 3 3 7-7" />
            </svg>
          {/if}
          <span data-step-label>{text[`reservation.step.${step}`]}</span>
        </span>
      {/snippet}
      <li aria-current={active ? "step" : undefined}>
        {#if done && href}
          <a {href} class={completedAction}>{@render content()}</a>
        {:else if done && step === "room" && onChangeRoom}
          <button type="button" onclick={onChangeRoom} class={completedAction}>
            {@render content()}
          </button>
        {:else}
          <div class="min-h-11">{@render content()}</div>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
