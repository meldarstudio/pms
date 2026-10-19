import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { createServer } from "vite";
import type { AnyRouter } from "@tanstack/react-router";

// Shared lifecycle from the page/dialog suites. HTTP fixtures stay in each suite.
export async function createBrowserTest() {
  const originalFetch = globalThis.fetch;
  const window = new Window({ url: "http://localhost:5173" });
  for (const name of [
    "window",
    "self",
    "document",
    "navigator",
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

    async function cleanup() {
      await React.act(async () => root.unmount());
      client.clear();
      container.remove();
      globalThis.fetch = originalFetch;
    }

    return { container, root, client, withClient, render, renderRouter, flush, until, cleanup };
  }

  async function close() {
    await server.close();
    await window.happyDOM.close();
  }

  return { window, React, query, routing, server, createPage, close };
}

export type BrowserTest = Awaited<ReturnType<typeof createBrowserTest>>;
export type BrowserPage = ReturnType<BrowserTest["createPage"]>;
