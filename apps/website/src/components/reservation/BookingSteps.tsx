import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { ui } from "@/i18n/ui";

export const bookingStepsKeys = [
  "reservation.steps",
  "reservation.step.room",
  "reservation.step.rate",
  "reservation.step.review",
] as const satisfies readonly (keyof (typeof ui)["es"])[];

export type BookingStepsText = Record<(typeof bookingStepsKeys)[number], string>;

const order = ["room", "rate", "review"] as const;
type BookingStep = (typeof order)[number];

const eyebrow = "font-source-sans-3 text-xs tracking-wide uppercase md:tracking-widest";
const completedAction =
  "flex min-h-11 w-full cursor-pointer flex-col justify-start [&_[data-step-label]]:underline [&_[data-step-label]]:decoration-stone-300 [&_[data-step-label]]:underline-offset-4 hover:[&_[data-step-label]]:text-accent-800 hover:[&_[data-step-label]]:decoration-accent-500";

export function BookingSteps({
  text,
  current,
  hrefs,
  onChangeRoom,
  id,
  className,
}: {
  text: BookingStepsText;
  current: BookingStep;
  hrefs?: Partial<Record<BookingStep, string>>;
  onChangeRoom?: () => void;
  id?: string;
  className?: string;
}) {
  const position = order.indexOf(current);
  const steps = order.map((step, index) => ({
    step,
    label: text[`reservation.step.${step}`],
    state: index < position ? "done" : index === position ? "current" : "next",
  }));

  return (
    <nav id={id} aria-label={text["reservation.steps"]} className={className}>
      <ol className="grid grid-cols-3 gap-2 md:gap-3">
        {steps.map(({ step, label, state }) => {
          const reached = state !== "next";
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn("block h-1 w-full", reached ? "bg-accent-500" : "bg-stone-300")}
              />
              <span
                className={cn(
                  "mt-3 flex items-center gap-1 text-left whitespace-nowrap md:gap-2",
                  eyebrow,
                  state === "current"
                    ? "font-semibold text-accent-800"
                    : state === "done"
                      ? "font-medium text-stone-900"
                      : "font-medium text-stone-600",
                )}
              >
                {state === "done" && (
                  <CheckIcon
                    aria-hidden="true"
                    weight="bold"
                    className="size-3 shrink-0 text-accent-700 md:size-3.5"
                  />
                )}
                <span data-step-label>{label}</span>
              </span>
            </>
          );
          return (
            <li key={step} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" && hrefs?.[step] ? (
                <a href={hrefs[step]} className={completedAction}>
                  {content}
                </a>
              ) : state === "done" && step === "room" && onChangeRoom ? (
                <button type="button" onClick={onChangeRoom} className={completedAction}>
                  {content}
                </button>
              ) : (
                <div className="min-h-11">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
