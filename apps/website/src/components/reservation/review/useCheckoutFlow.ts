import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { Lang } from "@/i18n/utils";
import { selectionKey } from "@/lib/reservation/checkout";
import {
  checkoutSelection,
  initialState,
  next,
  type Effect,
  type Event,
  type State,
} from "@/lib/reservation/checkout-flow";
import {
  createCheckoutRunner,
  readDraft,
  type CardPayments,
  type CheckoutRunner,
} from "@/lib/reservation/checkout-runner";
import { readSearch, type StaySearch } from "@/lib/reservation/search";
import type { FocusRegistry } from "./focus";

type Machine = { state: State; queue: readonly Effect[] };
type Action = { type: "event"; event: Event } | { type: "ran"; count: number };

const idle: Machine = { state: initialState, queue: [] };

function reduce(machine: Machine, action: Action): Machine {
  if (action.type === "ran") return { ...machine, queue: machine.queue.slice(action.count) };
  const { state, effects } = next(machine.state, action.event);
  return { state, queue: effects.length ? [...machine.queue, ...effects] : machine.queue };
}

export type CheckoutFlowOptions = {
  lang: Lang;
  apiBase: string;
  summaryHref: string;
  payments: CardPayments | null;
  paymentsKnown: boolean;
  roomTypeIds: Readonly<Record<string, string | null>>;
  securityContainer: { readonly current: HTMLElement | null };
  focus: FocusRegistry;
};

export function useCheckoutFlow({
  lang,
  apiBase,
  summaryHref,
  payments,
  paymentsKnown,
  roomTypeIds,
  securityContainer,
  focus,
}: CheckoutFlowOptions) {
  const [machine, act] = useReducer(reduce, idle);
  const [search, setSearch] = useState<StaySearch | null>(null);
  const runner = useRef<CheckoutRunner | null>(null);
  const started = useRef(false);
  const draftKey = useRef("");
  const dispatch = useCallback((event: Event) => act({ type: "event", event }), []);

  useLayoutEffect(() => {
    const created = createCheckoutRunner({
      apiBase,
      summaryHref,
      payments,
      dispatch,
      securityContainer: () => securityContainer.current,
      focus: focus.focus,
    });
    runner.current = created;
    return () => {
      created.dispose();
      runner.current = null;
    };
  }, [apiBase, summaryHref, payments, dispatch, securityContainer, focus]);

  useLayoutEffect(() => {
    if (machine.queue.length === 0) return;
    runner.current?.run(machine.queue);
    act({ type: "ran", count: machine.queue.length });
  }, [machine.queue]);

  useEffect(() => {
    if (!paymentsKnown || started.current) return;
    started.current = true;
    const found = readSearch(new URLSearchParams(window.location.search), Object.keys(roomTypeIds));
    const selection = checkoutSelection(found, found.room ? roomTypeIds[found.room] : null);
    draftKey.current = selection ? selectionKey(selection) : "";
    setSearch(found);
    dispatch({
      type: "started",
      lang,
      paymentsEnabled: Boolean(payments),
      selection,
      draft: readDraft(draftKey.current),
    });
  }, [paymentsKnown, roomTypeIds, lang, payments, dispatch]);

  useEffect(() => {
    const showPage = (event: PageTransitionEvent) =>
      dispatch({
        type: "pageShown",
        persisted: event.persisted,
        draft: readDraft(draftKey.current),
      });
    const restoreNetwork = () => dispatch({ type: "networkRestored" });
    window.addEventListener("pageshow", showPage);
    window.addEventListener("online", restoreNetwork);
    return () => {
      window.removeEventListener("pageshow", showPage);
      window.removeEventListener("online", restoreNetwork);
    };
  }, [dispatch]);

  return { state: machine.state, search, dispatch };
}
