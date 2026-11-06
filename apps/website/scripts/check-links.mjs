// Checks every link and asset in the built site (dist/).
//
// - Internal links (href, src, srcset, and same-site absolute URLs) must
//   resolve to a file in dist/. A #fragment must match an id on the target page.
// - External http(s) links are requested once each. 404/410, DNS failures, and
//   refused connections fail the run. 403/429, timeouts, and other errors only
//   print a warning, because many sites block bots.
// - mailto: and tel: links are only checked to be well formed.
//
// Usage: node scripts/check-links.mjs [--internal-only]
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const site = "https://www.hotelmanantialchurin.com";
const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
const internalOnly =
  process.argv.includes("--internal-only") || process.env.LINKS_INTERNAL_ONLY === "1";
const timeoutMs = 10_000;
const concurrency = 6;
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const failures = [];
const warnings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const [, name, double, single, bare] of source.matchAll(pattern)) {
    attributes[name.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? "");
  }
  return attributes;
}

function parseHtml(html) {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const links = [];
  const ids = new Set();
  for (const [, tagName, rawAttributes] of cleaned.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g)) {
    const tag = tagName.toLowerCase();
    const attributes = parseAttributes(rawAttributes);
    if (attributes.id) ids.add(attributes.id);
    if (tag === "a" && attributes.name) ids.add(attributes.name);

    const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/);
    const hintOnly = tag === "link" && (rel.includes("preconnect") || rel.includes("dns-prefetch"));
    if (attributes.href !== undefined && !hintOnly) {
      links.push({ tag, attribute: "href", value: attributes.href });
    }
    if (attributes.src !== undefined) {
      links.push({ tag, attribute: "src", value: attributes.src });
    }
    for (const name of ["srcset", "imagesrcset"]) {
      if (!attributes[name]) continue;
      for (const candidate of attributes[name].split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) links.push({ tag, attribute: name, value: url });
      }
    }
    const metaKey = attributes.property ?? attributes.name;
    if (tag === "meta" && /^(og|twitter):image$/.test(metaKey ?? "")) {
      links.push({
        tag,
        attribute: "content",
        value: attributes.content ?? "",
      });
    }
  }
  return { links, ids };
}

function pageUrlFor(file) {
  const relative = path.relative(distDir, file).split(path.sep).join("/");
  const urlPath = relative.endsWith("index.html")
    ? relative.slice(0, -"index.html".length)
    : relative;
  return new URL(`/${urlPath}`, site);
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

// Maps a same-site URL path to a file in dist/, the way Cloudflare's default
// asset handling ("auto-trailing-slash") does. Returns { file, redirect }, where
// redirect is set when the host only serves the file after a redirect, such as
// /404/ to /404 for dist/404.html.
async function resolveInDist(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const base = path.join(distDir, decoded);
  if (!base.startsWith(distDir.replace(/\/$/, ""))) return null;
  const candidates = decoded.endsWith("/")
    ? [[path.join(base, "index.html")], [`${base.slice(0, -1)}.html`, true]]
    : [[base], [path.join(base, "index.html"), true], [`${base}.html`]];
  for (const [file, redirect = false] of candidates) {
    if (await isFile(file)) return { file, redirect };
  }
  return null;
}

function checkMailto(url) {
  const addresses = decodeURIComponent(url.slice("mailto:".length).split("?")[0]);
  const email = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
  const list = addresses.split(",").map((part) => part.trim());
  if (list.length === 0 || !list.every((address) => email.test(address))) {
    return `malformed mailto address "${addresses}"`;
  }
  return null;
}

function checkTel(url) {
  const number = decodeURIComponent(url.slice("tel:".length));
  if (!/^\+?[0-9][0-9 ().-]{4,}$/.test(number)) {
    return `malformed tel number "${number}"`;
  }
  return null;
}

async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "es-PE,es;q=0.9,en;q=0.8",
    },
  });
  // Do not download bodies we do not need.
  await response.body?.cancel().catch(() => {});
  return response.status;
}

function describeError(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return { fatal: false, reason: `timed out after ${timeoutMs / 1000}s` };
  }
  const code = error?.cause?.code ?? error?.code;
  if (code === "ENOTFOUND") return { fatal: true, reason: "DNS lookup failed (ENOTFOUND)" };
  if (code === "ECONNREFUSED") return { fatal: true, reason: "connection refused (ECONNREFUSED)" };
  return {
    fatal: false,
    reason: `request failed (${code ?? error?.cause?.message ?? error?.message ?? error})`,
  };
}

async function checkExternal(url) {
  let headStatus;
  try {
    headStatus = await request(url, "HEAD");
    if (headStatus >= 200 && headStatus < 400) return null;
  } catch {
    // Some servers reject or hang on HEAD. Fall back to GET.
  }
  try {
    const status = await request(url, "GET");
    if (status >= 200 && status < 400) return null;
    if (status === 404 || status === 410) {
      return { fatal: true, reason: `HTTP ${status}` };
    }
    return { fatal: false, reason: `HTTP ${status}` };
  } catch (error) {
    return describeError(error);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

const htmlFiles = (await walk(distDir)).filter((file) => file.endsWith(".html")).sort();
if (htmlFiles.length === 0) {
  console.error(`No HTML files found in ${distDir}. Run pnpm build first.`);
  process.exit(1);
}

const pages = new Map();
for (const file of htmlFiles) {
  pages.set(file, parseHtml(await readFile(file, "utf8")));
}

const external = new Map();
let internalCount = 0;

for (const [file, { links, ids: ownIds }] of pages) {
  const page = path.relative(distDir, file).split(path.sep).join("/");
  const pageUrl = pageUrlFor(file);
  const fail = (link, reason) => failures.push({ page, link, reason });
  const warn = (link, reason) => warnings.push({ page, link, reason });

  for (const { value } of links) {
    const raw = value.trim();
    if (raw === "") {
      fail(value, "empty link");
      continue;
    }
    const scheme = raw.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme === "mailto") {
      const problem = checkMailto(raw);
      if (problem) fail(raw, problem);
      continue;
    }
    if (scheme === "tel") {
      const problem = checkTel(raw);
      if (problem) fail(raw, problem);
      continue;
    }
    if (scheme === "data" || scheme === "javascript" || scheme === "blob") {
      continue;
    }
    if (scheme && scheme !== "http" && scheme !== "https") {
      warn(raw, `unchecked URL scheme "${scheme}:"`);
      continue;
    }

    let url;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      fail(raw, "invalid URL");
      continue;
    }

    if (url.origin !== new URL(site).origin) {
      url.hash = "";
      const key = url.href;
      if (!external.has(key)) external.set(key, new Set());
      external.get(key).add(page);
      continue;
    }

    internalCount++;
    const resolved = await resolveInDist(url.pathname);
    if (!resolved) {
      fail(raw, `no file in dist/ for ${url.pathname}`);
      continue;
    }
    const target = resolved.file;
    if (resolved.redirect) {
      const servedAs = path.relative(distDir, target).split(path.sep).join("/");
      warn(raw, `only resolves through a host redirect (serves dist/${servedAs})`);
    }
    const fragment = decodeURIComponent(url.hash.slice(1));
    if (fragment && fragment !== "top") {
      const targetIds = target === file ? ownIds : pages.get(target)?.ids;
      if (!targetIds) {
        fail(raw, `#${fragment} points into a non-HTML file`);
      } else if (!targetIds.has(fragment)) {
        const targetPage = path.relative(distDir, target).split(path.sep).join("/");
        fail(raw, `no element with id "${fragment}" on ${targetPage}`);
      }
    }
  }
}

console.log(`Checked ${internalCount} internal links on ${htmlFiles.length} pages.`);

if (internalOnly) {
  console.log(`Skipped ${external.size} external URLs (--internal-only).`);
} else {
  const urls = [...external.keys()];
  const results = await mapLimit(urls, concurrency, checkExternal);
  urls.forEach((url, index) => {
    const result = results[index];
    if (!result) return;
    const foundOn = [...external.get(url)];
    const page =
      foundOn.length > 3
        ? `${foundOn.slice(0, 3).join(", ")} and ${foundOn.length - 3} more`
        : foundOn.join(", ");
    (result.fatal ? failures : warnings).push({
      page,
      link: url,
      reason: result.reason,
    });
  });
  console.log(`Checked ${urls.length} unique external URLs.`);
}

const unique = (entries) => [
  ...new Map(entries.map((entry) => [JSON.stringify(entry), entry])).values(),
];

for (const { page, link, reason } of unique(warnings)) {
  console.warn(`WARN  ${page}\n      ${link}\n      ${reason}`);
}
for (const { page, link, reason } of unique(failures)) {
  console.error(`FAIL  ${page}\n      ${link}\n      ${reason}`);
}

const failureCount = unique(failures).length;
const warningCount = unique(warnings).length;
if (failureCount > 0) {
  console.error(`\n${failureCount} broken link(s), ${warningCount} warning(s).`);
  process.exit(1);
}
console.log(`\nNo broken links. ${warningCount} warning(s).`);
