import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { createServer } from "vite";
import type { AnyRouter } from "@tanstack/react-router";
import type { Element as DomElement, HTMLInputElement, HTMLTextAreaElement } from "happy-dom";
import { createFakeBackend } from "./fake-backend.ts";

export const desktopViewport = { width: 1024, height: 768 };
export const mobileViewport = { width: 390, height: 844 };

// Shared lifecycle from the page/dialog suites. Each page answers HTTP with its own
// fake backend (`page.api`); suites register the responses their scenarios need.
export async function createBrowserTest() {
  const originalFetch = globalThis.fetch;
  const window = new Window({ url: "http://localhost:5173" });
  for (const name of [
    "window",
    "self",
    "document",
    "navigator",
    "localStorage",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "Element",
    "SVGElement",
    "HTMLButtonElement",
    "HTMLSelectElement",
    "Node",
    "NodeFilter",
    "Text",
    "Document",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "PointerEvent",
    "MutationObserver",
    "ResizeObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "scrollTo",
  ]) {
    const value = name === "window" ? window : Reflect.get(window, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: typeof value === "function" && /^[a-z]/.test(name) ? value.bind(window) : value,
    });
  }
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const query = await import("@tanstack/react-query");
  const routing = await import("@tanstack/react-router");
  // Compile actual TSX with the portal's aliases/env without a listening server.
  const server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    mode: "development",
  });

  function createPage() {
    const api = createFakeBackend();
    globalThis.fetch = api.fetch;
    const container = window.document.createElement("div");
    window.document.body.append(container);
    // happy-dom implements the DOM nodes React expects at this seam.
    const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
    const client = new query.QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { gcTime: Infinity },
      },
    });
    const withClient = (element: React.ReactNode) =>
      React.createElement(query.QueryClientProvider, { client }, element);

    async function render(element: React.ReactNode) {
      await React.act(async () => root.render(withClient(element)));
    }

    async function renderRouter(router: AnyRouter) {
      await React.act(async () => {
        await router.load();
        root.render(withClient(React.createElement(routing.RouterProvider, { router })));
      });
    }

    async function flush(ms = 0) {
      await React.act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      });
    }

    async function until(condition: () => boolean, message = "Expected page state") {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (condition()) return;
        await flush(10);
      }
      assert.ok(condition(), `${message}: ${container.textContent}`);
    }

    /** A button anywhere in the document (including dialogs) by trimmed text or aria-label. */
    function button(label: string) {
      const element = Array.from(window.document.querySelectorAll("button")).find(
        (element) =>
          element.textContent.trim() === label || element.getAttribute("aria-label") === label,
      );
      assert.ok(element, `Missing button ${label}`);
      return element;
    }

    async function click(label: string) {
      await React.act(async () => button(label).click());
    }

    /** An input or textarea anywhere in the document by its name. */
    function field(name: string) {
      const element = window.document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="${name}"]`,
      );
      assert.ok(element, `Missing field ${name}`);
      return element;
    }

    /** Types into a named field or a given input/textarea the way React observes it. */
    async function fill(target: string | DomElement, value: string) {
      await React.act(async () => {
        const element = typeof target === "string" ? field(target) : target;
        const prototype =
          element.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
        element.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    }

    let resized = false;
    /** Switches to a phone-sized window until cleanup restores the desktop size. */
    function mobile() {
      resized = true;
      window.happyDOM.setWindowSize(mobileViewport);
    }

    async function cleanup() {
      await React.act(async () => root.unmount());
      client.clear();
      container.remove();
      globalThis.fetch = originalFetch;
      if (resized) window.happyDOM.setWindowSize(desktopViewport);
    }

    return {
      api,
      container,
      root,
      client,
      withClient,
      render,
      renderRouter,
      flush,
      until,
      button,
      click,
      field,
      fill,
      mobile,
      cleanup,
    };
  }

  async function close() {
    await server.close();
    await window.happyDOM.close();
  }

  return { window, React, query, routing, server, createPage, close };
}

export type BrowserTest = Awaited<ReturnType<typeof createBrowserTest>>;
export type BrowserPage = ReturnType<BrowserTest["createPage"]>;
