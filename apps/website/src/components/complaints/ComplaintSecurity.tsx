import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useTranslations } from "@/i18n/utils";
import { renderSecurityCheck, type SecurityCheck } from "@/lib/reservation/providers";

export function ComplaintSecurity({
  siteKey,
  language,
  onToken,
}: {
  siteKey: string | null;
  language: "es" | "en";
  onToken: (token: string) => void;
}) {
  const t = useTranslations(language);
  const container = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = container.current!;
    const measure = () => setCompact(element.clientWidth < 300);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!siteKey || compact === null) return;
    let active = true;
    let check: SecurityCheck | null = null;
    onToken("");
    setFailed(false);
    const fail = () => {
      if (active) {
        onToken("");
        setFailed(true);
      }
    };
    void renderSecurityCheck(container.current!, {
      siteKey,
      lang: language,
      action: "complaint",
      size: compact ? "compact" : "flexible",
      theme: "light",
      onPassed: (token) => {
        if (active) {
          onToken(token);
          setFailed(false);
        }
      },
      onExpired: () => active && onToken(""),
      onError: fail,
    })
      .then((rendered) => {
        if (active) check = rendered;
        else rendered.dispose();
      })
      .catch(fail);
    return () => {
      active = false;
      onToken("");
      check?.dispose();
    };
  }, [siteKey, language, compact, attempt, onToken]);

  return (
    <div
      className="flex w-full flex-col gap-3"
      role="group"
      aria-label={t("complaints.securityCheck")}
    >
      <div ref={container} />
      {(!siteKey || failed) && <FieldError>{t("complaints.securityUnavailable")}</FieldError>}
      {siteKey && failed && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("complaints.retrySecurityCheck")}
        </Button>
      )}
    </div>
  );
}
