import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { chromium } from "@playwright/test";

const variants = ["react", "vue", "svelte"];
const flags = process.argv.slice(2);
const runs = Number(flags.find((flag) => flag.startsWith("--runs="))?.split("=")[1] ?? 7);
const preview = flags.includes("--serve");
const mobile = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
};
assert(Number.isInteger(runs) && runs >= 1, "--runs must be a positive integer");

if (!flags.includes("--reuse-builds")) {
  for (const variant of variants) {
    const build = spawnSync(
      "pnpm",
      ["exec", "astro", "build", "--config", "astro.landing-prototype.config.mjs"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          LANDING_PROTOTYPE: variant,
          PUBLIC_PMS_API_URL: "http://localhost:8788",
        },
      },
    );
    if (build.error) throw build.error;
    if (build.status !== 0) {
      process.stderr.write(`${build.stdout}${build.stderr}`);
      process.exit(build.status ?? 1);
    }
    console.log(`${variant}: built`);
  }
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain",
  ".xml": "application/xml",
};
const compressible = new Set([".html", ".js", ".css", ".svg"]);

async function serve(variant, port) {
  const root = resolve(".landing-prototype", variant);
  await readFile(resolve(root, "index.html"));
  const bodies = new Map();
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const file = resolve(root, `.${pathname}${pathname.endsWith("/") ? "index.html" : ""}`);
      if (!file.startsWith(`${root}${sep}`)) return response.writeHead(404).end();
      const ext = extname(file);
      const compress =
        compressible.has(ext) && /\bbr\b/.test(request.headers["accept-encoding"] ?? "");
      const key = `${file}:${compress}`;
      let body = bodies.get(key);
      if (!body) {
        const bytes = await readFile(file);
        body = compress
          ? brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
          : bytes;
        bodies.set(key, body);
      }
      return response
        .writeHead(200, {
          "Content-Type": contentTypes[ext] ?? "application/octet-stream",
          "Content-Length": body.length,
          "Cache-Control": "no-store",
          ...(compress ? { "Content-Encoding": "br" } : {}),
        })
        .end(body);
    } catch {
      return response.writeHead(404).end();
    }
  });
  await new Promise((listen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", listen);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

const servers = new Map();
try {
  for (const [index, variant] of variants.entries()) {
    servers.set(variant, await serve(variant, preview ? 4310 + index : 0));
  }
  if (preview) {
    for (const [variant, { origin }] of servers) console.log(`${variant}: ${origin}/`);
    await new Promise((stop) => {
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } else {
    await compare();
  }
} finally {
  for (const server of servers.values()) server.close();
}

async function compare() {
  const browser = await chromium.launch();
  try {
    for (const [variant, { origin }] of servers) {
      await checkHandoff(browser, origin, false);
      await checkHandoff(browser, origin, true);
      console.log(`${variant}: desktop (EN) and mobile (ES) booking handoff verified`);
    }

    const samples = Object.fromEntries(variants.map((variant) => [variant, []]));
    for (let run = 0; run < runs; run++) {
      for (let index = 0; index < variants.length; index++) {
        const variant = variants[(index + run) % variants.length];
        samples[variant].push(await measure(browser, servers.get(variant).origin));
      }
    }
    const median = (values) => {
      const ordered = [...values].sort((a, b) => a - b);
      return (
        (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) /
        2
      );
    };
    const summarize = (values) =>
      Object.fromEntries(
        Object.keys(values[0]).map((metric) => [
          metric,
          Math.round(median(values.map((value) => value[metric]))),
        ]),
      );
    console.log(
      `Cold mobile medians (${runs} runs each, 150 ms latency, 1.6 Mbps down, 4× CPU slowdown)`,
    );
    console.table(
      Object.fromEntries(variants.map((variant) => [variant, summarize(samples[variant])])),
    );
    if (flags.includes("--samples")) console.log(JSON.stringify(samples, null, 2));
  } finally {
    await browser.close();
  }
}

async function pageAt(browser, origin, options, usePage) {
  const context = await browser.newContext(options);
  const errors = [];
  try {
    await context.route(
      (url) => url.origin !== origin,
      (route) => route.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => errors.push(error.message));
    const result = await usePage(page, context);
    assert.deepEqual(errors, [], "browser errors");
    return result;
  } finally {
    await context.close();
  }
}

async function waitForCalendarToSlideIn(page) {
  await page.waitForFunction(() => {
    const grid = document.querySelector('[data-slot="calendar"] [role="grid"]');
    const rect = grid?.getBoundingClientRect();
    return rect?.height && rect.bottom <= window.innerHeight;
  });
}

async function checkHandoff(browser, origin, smallScreen) {
  await pageAt(
    browser,
    origin,
    smallScreen ? mobile : { viewport: { width: 1366, height: 900 } },
    async (page) => {
      const home = smallScreen ? "/" : "/en/";
      const rooms = `${home}habitaciones/`;
      await page.clock.setFixedTime(new Date("2026-11-20T16:00:00Z"));
      await page.route(
        (url) => url.pathname === rooms,
        (route) => route.fulfill({ status: 200, body: "Choose" }),
      );
      await page.goto(`${origin}${home}`);
      const form = page.locator("#availability form");
      const arrival = form.locator("#stay-check-in");
      const departure = form.locator("#stay-check-out");
      const guests = form.locator("button[aria-labelledby='stay-guests-label stay-guests-value']");
      const submit = form.getByRole("button", {
        name: /Consultar disponibilidad|Check availability/,
      });
      const calendar = page.locator('[data-slot="calendar"]:visible');
      const day = (value) => calendar.locator(`[data-date="${value}"]`).first();
      const input = (name) => form.locator(`input[name="${name}"]`);

      await submit.click();
      assert.equal(await arrival.getAttribute("aria-invalid"), "true");
      assert.equal(await arrival.evaluate((button) => button === document.activeElement), true);
      await arrival.click();
      await calendar.waitFor();
      assert.equal(await calendar.getByRole("grid").count(), smallScreen ? 1 : 2);
      if (smallScreen) {
        await waitForCalendarToSlideIn(page);
        await page.getByRole("button", { name: "Cerrar calendario" }).click();
      } else {
        await page.keyboard.press("Escape");
      }
      await calendar.waitFor({ state: "hidden" });
      assert.equal(await arrival.evaluate((button) => button === document.activeElement), true);

      await arrival.click();
      if (smallScreen) {
        await waitForCalendarToSlideIn(page);
        await day("2026-11-21").click();
      } else {
        await day("2026-11-21").focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await day("2026-11-22").evaluate((cell) => cell === document.activeElement),
          true,
        );
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("Enter");
      }
      assert.equal(await input("checkIn").inputValue(), "2026-11-21");
      await day("2026-11-24").click();
      await calendar.waitFor({ state: "hidden" });
      assert.equal(await input("checkOut").inputValue(), "2026-11-24");
      await departure.click();
      if (smallScreen) await waitForCalendarToSlideIn(page);
      await day("2026-11-25").click();
      await calendar.waitFor({ state: "hidden" });
      await guests.click();
      await page
        .getByRole("button", { name: /Aumentar (adultos|niños)|Increase (adults|children)/ })
        .first()
        .click();
      await page.keyboard.press("Escape");
      assert.equal(await input("adults").inputValue(), "3");

      await Promise.all([page.waitForURL((url) => url.pathname === rooms), submit.click()]);
      const destination = new URL(page.url());
      assert.deepEqual(Object.fromEntries(destination.searchParams), {
        checkIn: "2026-11-21",
        checkOut: "2026-11-25",
        adults: "3",
        children: "0",
      });
      await page.goto(`${origin}${home}`);
      await form.locator("fieldset:enabled").waitFor();
      assert.equal(await input("checkIn").inputValue(), "2026-11-21");
      assert.equal(await input("adults").inputValue(), "3");
    },
  );
}

async function measure(browser, origin) {
  return pageAt(browser, origin, mobile, async (page, context) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.landingSample = {};
      new PerformanceObserver((list) => {
        window.landingSample.lcp = list.getEntries().at(-1)?.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      const observer = new MutationObserver(() => {
        if (
          document.querySelector('#availability form[aria-busy="false"]') &&
          !window.landingSample.ready
        )
          window.landingSample.ready = performance.now();
      });
      observer.observe(document, { subtree: true, attributes: true, childList: true });
      document.addEventListener(
        "click",
        (event) => {
          if (!event.target.closest?.("#stay-check-in")) return;
          const measureCalendar = (frame) => {
            const grid = document.querySelector('[data-slot="calendar"] [role="grid"]');
            const rect = grid?.getBoundingClientRect();
            if (!rect?.height || rect.bottom > window.innerHeight) {
              requestAnimationFrame(measureCalendar);
              return;
            }
            window.landingSample.open = frame - event.timeStamp;
            observer.disconnect();
          };
          requestAnimationFrame(measureCalendar);
        },
        { capture: true },
      );
    });
    await page.goto(origin, { waitUntil: "load" });
    await page.waitForFunction(() => window.landingSample.ready && window.landingSample.lcp);
    await page.evaluate(async () => {
      await document.querySelector("picture img").decode();
      await new Promise((paint) => requestAnimationFrame(() => requestAnimationFrame(paint)));
    });
    await page.locator("#stay-check-in").tap();
    await page.waitForFunction(() => window.landingSample.open);
    const metrics = await page.evaluate(() => {
      const scriptBytes = performance
        .getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
        .reduce((sum, entry) => sum + entry.encodedBodySize, 0);
      return {
        "JS Brotli bytes": scriptBytes,
        "LCP ms": window.landingSample.lcp,
        "Form ready ms": window.landingSample.ready,
        "Calendar open ms": window.landingSample.open,
      };
    });
    assert(metrics["JS Brotli bytes"] > 0);
    return metrics;
  });
}
