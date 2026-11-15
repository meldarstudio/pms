import type { RefCallback } from "react";
import { problemPresentation, type Problem } from "@/lib/reservation/checkout-copy";
import { useReview } from "./context";
import { panel, primary } from "./styles";

export function ProblemPanel({
  problem,
  roomName,
  titleRef,
  onRetry,
}: {
  problem: Problem | null;
  roomName: string;
  titleRef: RefCallback<HTMLElement>;
  onRetry: () => void;
}) {
  const { say } = useReview();
  const presentation = problem ? problemPresentation(problem) : null;
  const values = { room: roomName };
  return (
    <div className={`mt-6 ${panel}`} data-problem hidden={!problem}>
      <h2
        ref={titleRef}
        className="text-xl font-semibold text-stone-900"
        tabIndex={-1}
        data-problem-title
      >
        {presentation ? say(presentation.titleKey, values) : ""}
      </h2>
      <p className="mt-3 leading-relaxed text-stone-700" data-problem-body>
        {presentation ? say(presentation.bodyKey, values) : ""}
      </p>
      <div className="mt-6 flex flex-wrap gap-3" hidden={!presentation?.retry}>
        <button
          type="button"
          className={primary}
          data-retry
          hidden={!presentation?.retry}
          onClick={onRetry}
        >
          {say("reservation.choose.retry")}
        </button>
      </div>
    </div>
  );
}
