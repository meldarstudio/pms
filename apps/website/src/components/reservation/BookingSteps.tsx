import { ArrowLeftIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import type { ui } from "@/i18n/ui";
import { fill } from "@/lib/reservation/format";

export const bookingStepsKeys = [
  "reservation.steps",
  "reservation.step.room",
  "reservation.step.rate",
  "reservation.step.review",
  "reservation.step.count",
  "reservation.step.changeRoom",
] as const satisfies readonly (keyof (typeof ui)["es"])[];

export type BookingStepsText = Record<(typeof bookingStepsKeys)[number], string>;

const order = ["room", "rate", "review"] as const;
type BookingStep = (typeof order)[number];

const eyebrow = "font-source-sans-3 text-xs font-medium tracking-widest uppercase";

/**
 * Room → rate → review, as filling segments from `md` and as "Step n of 3" with a way back
 * on phones. `onChangeRoom` makes the finished room step a button; without it (on Review,
 * which renders statically) finished steps are plain text.
 */
export function BookingSteps({
  text,
  current,
  onChangeRoom,
  id,
  className,
}: {
  text: BookingStepsText;
  current: BookingStep;
  onChangeRoom?: () => void;
  id?: string;
  className?: string;
}) {
  const position = order.indexOf(current);
  const steps = order.map((step, index) => ({
    step,
    number: index + 1,
    label: text[`reservation.step.${step}`],
    state: index < position ? "done" : index === position ? "current" : "next",
  }));

  return (
    <nav id={id} aria-label={text["reservation.steps"]} className={className}>
      <ol className="hidden grid-cols-3 gap-3 md:grid">
        {steps.map(({ step, number, label, state }) => {
          const reached = state !== "next";
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn("block h-1 w-full", reached ? "bg-accent-500" : "bg-stone-300")}
              />
              <span
                className={cn(
                  "mt-3 flex items-center gap-2 text-left",
                  eyebrow,
                  reached ? "text-stone-900" : "text-stone-600",
                )}
              >
                <span aria-hidden="true" className={reached ? "text-accent-700" : undefined}>
                  {String(number).padStart(2, "0")}
                </span>
                <span data-step-label>{label}</span>
                {state === "done" && (
                  <CheckIcon
                    aria-hidden="true"
                    weight="bold"
                    className="size-3.5 text-accent-700"
                  />
                )}
              </span>
            </>
          );
          return (
            <li key={step} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" && step === "room" && onChangeRoom ? (
                <button
                  type="button"
                  onClick={onChangeRoom}
                  className="flex min-h-11 w-full cursor-pointer flex-col justify-start hover:[&_[data-step-label]]:text-accent-800 hover:[&_[data-step-label]]:underline hover:[&_[data-step-label]]:underline-offset-4"
                >
                  {content}
                  <span className="sr-only">: {text["reservation.step.changeRoom"]}</span>
                </button>
              ) : (
                <div className="min-h-11">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1 md:hidden">
        <div className="flex min-h-11 items-center gap-4">
          <p className={cn(eyebrow, "text-accent-700")}>
            {fill(text["reservation.step.count"], { current: position + 1, total: order.length })}
            <span className="text-stone-600"> · {steps[position]!.label}</span>
          </p>
          <span aria-hidden="true" className="flex gap-1">
            {steps.map(({ step, state }) => (
              <span
                key={step}
                className={cn("h-1 w-8", state === "next" ? "bg-stone-300" : "bg-accent-500")}
              />
            ))}
          </span>
        </div>
        {position > 0 && onChangeRoom && (
          <button
            type="button"
            onClick={onChangeRoom}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-stone-900 hover:text-accent-800",
              eyebrow,
            )}
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            {text["reservation.step.changeRoom"]}
          </button>
        )}
      </div>
    </nav>
  );
}
