import { useState, type RefCallback } from "react";
import type { FocusTarget } from "@/lib/reservation/checkout-flow";

export function createFocusRegistry() {
  const elements = new Map<FocusTarget, HTMLElement>();
  const callbacks = new Map<FocusTarget, RefCallback<HTMLElement>>();
  return {
    ref(target: FocusTarget): RefCallback<HTMLElement> {
      let callback = callbacks.get(target);
      if (!callback) {
        callback = (element) => {
          if (element) elements.set(target, element);
          else elements.delete(target);
        };
        callbacks.set(target, callback);
      }
      return callback;
    },
    focus(target: FocusTarget) {
      elements.get(target)?.focus();
    },
  };
}

export type FocusRegistry = ReturnType<typeof createFocusRegistry>;

export const useFocusRegistry = () => useState(createFocusRegistry)[0];

function createDroppedFocusRestore() {
  let pending = false;
  return {
    expectReplacement() {
      pending = true;
    },
    restore(element: HTMLElement | null) {
      if (!element || !pending) return;
      pending = false;
      if (document.activeElement === document.body) element.focus();
    },
  };
}

export const useDroppedFocusRestore = () => useState(createDroppedFocusRestore)[0];
