<script lang="ts">
  import { problemPresentation, type Problem } from "@/lib/reservation/checkout-copy";
  import { getReview } from "./review-context";
  import { panel, primary } from "./styles";

  let {
    problem,
    roomName,
    onRetry,
  }: { problem: Problem | null; roomName: string; onRetry: () => void } = $props();
  const { say } = getReview();
  const presentation = $derived(problem ? problemPresentation(problem) : null);
  const values = $derived({ room: roomName });
</script>

<div class={`mt-6 ${panel}`} data-problem hidden={!problem}>
  <h2
    class="text-xl font-semibold text-stone-900"
    tabindex="-1"
    data-problem-title
    data-checkout-focus="problemTitle"
  >
    {presentation ? say(presentation.titleKey, values) : ""}
  </h2>
  <p class="mt-3 leading-relaxed text-stone-700" data-problem-body>
    {presentation ? say(presentation.bodyKey, values) : ""}
  </p>
  <div class="mt-6 flex flex-wrap gap-3" hidden={!presentation?.retry}>
    <button
      type="button"
      class={primary}
      data-retry
      hidden={!presentation?.retry}
      onclick={onRetry}
    >
      {say("reservation.choose.retry")}
    </button>
  </div>
</div>
