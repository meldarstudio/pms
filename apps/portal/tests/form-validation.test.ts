import assert from "node:assert/strict";
import { describe, it, onTestFinished, vi } from "vite-plus/test";
import { focusFirstError } from "../src/lib/form-validation.ts";

describe("first invalid field", () => {
  it("focuses the first editable error in form order after messages mount", () => {
    let render: FrameRequestCallback | undefined;
    const previous = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      render = callback;
      return 1;
    };
    onTestFinished(() => {
      if (previous) globalThis.requestAnimationFrame = previous;
      else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    });
    const controls = ["locked-date", "room-stable-id", "guest-name"].map((id, index) => ({
      id,
      matches: () => index === 0,
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }));
    const form = {
      isConnected: true,
      querySelectorAll: () => controls,
    } as unknown as HTMLFormElement;
    focusFirstError(form, {
      "guest-name": "Ingresa los nombres.",
      "locked-date": "Fechas inválidas.",
      "room-stable-id": "Selecciona un tipo.",
    });
    assert.deepEqual(controls[1]!.focus.mock.calls, []);
    render!(0);
    assert.deepEqual(controls[0]!.focus.mock.calls, []);
    assert.deepEqual(controls[1]!.focus.mock.calls, [[{ preventScroll: true }]]);
    assert.deepEqual(controls[1]!.scrollIntoView.mock.calls, [[{ block: "nearest" }]]);
    assert.deepEqual(controls[2]!.focus.mock.calls, []);
  });
});
