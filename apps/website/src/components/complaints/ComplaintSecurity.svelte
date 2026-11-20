<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "@ui-sdk/svelte/button";
  import { useTranslations, type Lang } from "@/i18n/utils";
  import { renderSecurityCheck, type SecurityCheck } from "@/lib/reservation/providers";

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
  let widthProbe: HTMLDivElement;
  let container = $state<HTMLDivElement>();
  let compact = $state<boolean | null>(null);
  let failed = $state(false);
  let attempt = $state(0);

  onMount(() => {
    const measure = () => {
      compact = widthProbe.clientWidth < 300;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(widthProbe);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!siteKey || !container || compact === null) return;
    const notify = onToken;
    let active = true;
    let check: SecurityCheck | null = null;
    const fail = () => {
      if (!active) return;
      notify("");
      failed = true;
    };
    notify("");
    failed = false;
    void renderSecurityCheck(container, {
      siteKey,
      lang: language,
      action: "complaint",
      size: compact ? "compact" : "flexible",
      theme: "light",
      onPassed: (token) => {
        if (!active) return;
        notify(token);
        failed = false;
      },
      onExpired: () => {
        if (active) notify("");
      },
      onError: fail,
    })
      .then((rendered) => {
        if (active) check = rendered;
        else rendered.dispose();
      })
      .catch(fail);
    return () => {
      active = false;
      notify("");
      check?.dispose();
    };
  });
</script>

<div class="flex w-full flex-col gap-3" role="group" aria-label={t("complaints.securityCheck")}>
  <div bind:this={widthProbe}>
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
