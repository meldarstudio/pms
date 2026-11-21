<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button";
  import { Effect, Layer } from "effect";
  import { useTranslations, type Lang } from "@/i18n/utils";
  import { startIsland } from "@/lib/island";
  import { renderSecurityCheck } from "@/lib/reservation/providers";

  let {
    siteKey,
    language,
    onToken,
  }: {
    siteKey: string | null;
    language: Lang;
    onToken: (token: string) => void;
  } = $props();

  const t = $derived(useTranslations(language));
  let container = $state<HTMLDivElement>();
  let width = $state<number>();
  const compact = $derived(width === undefined ? null : width < 300);
  let failed = $state(false);
  let attempt = $state(0);

  $effect(() => {
    if (!siteKey || !container || compact === null) return;
    const notify = onToken;
    let active = true;
    const fail = () => {
      if (!active) return;
      notify("");
      failed = true;
    };
    notify("");
    failed = false;
    const island = startIsland(Layer.empty);
    island.fork(
      renderSecurityCheck(container, {
        siteKey,
        lang: language,
        action: "complaint",
        size: compact ? "compact" : "flexible",
        onPassed: (token) => {
          if (!active) return;
          notify(token);
          failed = false;
        },
        onExpired: () => {
          if (active) notify("");
        },
        onError: fail,
      }).pipe(
        Effect.andThen(Effect.never),
        Effect.catch(() => Effect.sync(fail)),
        Effect.scoped,
      ),
    );
    return () => {
      active = false;
      notify("");
      island.dispose();
    };
  });
</script>

<div class="flex w-full flex-col gap-3" role="group" aria-label={t("complaints.securityCheck")}>
  <div bind:clientWidth={width}>
    {#key attempt}<div bind:this={container}></div>{/key}
  </div>
  {#if !siteKey || failed}
    <p role="alert" class="complaint-error">{t("complaints.securityUnavailable")}</p>
  {/if}
  {#if siteKey && failed}
    <Button
      type="button"
      class="complaint-button self-start"
      data-variant="outline"
      onclick={() => attempt++}
    >
      {t("complaints.retrySecurityCheck")}
    </Button>
  {/if}
</div>
