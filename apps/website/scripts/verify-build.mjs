import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";

const site = "https://www.hotelmanantialchurin.com";
const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

async function read(base, path) {
  return readFile(new URL(path, base), "utf8");
}

function linksInHead(html) {
  const head = html.split("</head>")[0];
  return [...head.matchAll(/<link\b[^>]*>/g)].map(([tag]) => ({
    rel: tag.match(/\brel="([^"]+)"/)?.[1],
    hreflang: tag.match(/\bhreflang="([^"]+)"/)?.[1],
    href: tag.match(/\bhref="([^"]+)"/)?.[1],
  }));
}

function checkPage(html, lang, urls, is404 = false) {
  assert.match(html, new RegExp(`<html lang="${lang}"`));
  const head = html.split("</head>")[0];
  assert.ok(
    head.includes(`<meta property="og:image" content="${site}/og.jpg"`),
    "og:image must be the absolute share image",
  );
  assert.match(head, /<meta property="og:image:width" content="2400"/);
  assert.match(head, /<meta property="og:image:height" content="1260"/);
  const links = linksInHead(html);
  const canonicals = links.filter(({ rel }) => rel === "canonical");

  if (is404) {
    assert.deepEqual(canonicals, [], "404 pages must not have a canonical");
    assert.match(head, /<meta name="robots" content="noindex, nofollow"/);
  } else {
    assert.deepEqual(
      canonicals.map(({ href }) => href),
      [urls[lang]],
    );
  }

  assert.deepEqual(
    Object.fromEntries(
      links.filter(({ rel }) => rel === "alternate").map(({ hreflang, href }) => [hreflang, href]),
    ),
    { es: urls.es, en: urls.en, "x-default": urls.es },
  );
}

const pageFiles = async (locale) =>
  (await readdir(new URL(`src/pages/${locale}`, root), { recursive: true }))
    .filter((file) => file.endsWith(".astro") && (locale !== "" || !file.startsWith("en/")))
    .sort();

const spanishPages = await pageFiles("");
const englishPages = await pageFiles("en/");
assert.deepEqual(englishPages, spanishPages, "Every route needs both locales");
assert(spanishPages.includes("404.astro"), "Missing 404 page");
assert(spanishPages.includes("index.astro"), "Missing homepage");

const sitemapUrls = new Set();
const expectedRedirects = ["/nosotros / 301", "/nosotros/ / 301"];
for (const file of spanishPages) {
  const slug = file.replace(/\.astro$/, "");
  const path = slug === "index" ? "" : `${slug.replace(/(^|\/)index$/, "")}/`;
  const urls = {
    es: `${site}/${path}`,
    en: `${site}/en/${path}`,
  };
  const output = slug === "404" ? "404.html" : `${path}index.html`;

  let noIndex = false;
  for (const lang of ["es", "en"]) {
    const html = await read(dist, `${lang === "en" ? "en/" : ""}${output}`);
    checkPage(html, lang, urls, slug === "404");
    for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="(\/[^"]*)"/g)) {
      assert.ok(
        new URL(href, site).pathname.endsWith("/"),
        `Internal link needs a trailing slash: ${href} in ${lang} ${slug}`,
      );
    }
    const pathname = new URL(urls[lang]).pathname;
    if (slug !== "404" && pathname !== "/") {
      expectedRedirects.push(`${pathname.slice(0, -1)} ${pathname} 301`);
    }
    const head = html.split("</head>")[0];
    const pageNoIndex = /<meta name="robots" content="[^"]*noindex/.test(head);
    if (lang === "es") noIndex = pageNoIndex;
    else assert.equal(pageNoIndex, noIndex, `${slug} index rules must match`);
    if (slug !== "404" && !pageNoIndex) sitemapUrls.add(urls[lang]);
  }
}

assert.deepEqual(
  (await read(dist, "_redirects"))
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .sort(),
  expectedRedirects.sort(),
  "public/_redirects must exactly match the expected canonical and retired-page 301 redirects",
);

const index = await read(dist, "sitemap-index.xml");
const sitemapFiles = [...index.matchAll(/<sitemap><loc>([^<]+)<\/loc><\/sitemap>/g)].map(
  ([, url]) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, site);
    return parsed.pathname.slice(1);
  },
);
assert(sitemapFiles.length > 0, "Sitemap index has no sitemaps");

const listedUrls = new Set();
for (const file of sitemapFiles) {
  const xml = await read(dist, file);
  for (const [, entry] of xml.matchAll(/<url>(.*?)<\/url>/gs)) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    assert(loc, `Missing loc in ${file}`);
    assert(!listedUrls.has(loc), `Duplicate sitemap entry: ${loc}`);
    listedUrls.add(loc);

    const url = new URL(loc);
    const isEnglish = url.pathname.startsWith("/en/");
    const path = isEnglish ? url.pathname.slice(4) : url.pathname.slice(1);
    const expected = {
      "es-PE": `${site}/${path}`,
      "en-US": `${site}/en/${path}`,
    };
    assert.deepEqual(
      Object.fromEntries(
        [...entry.matchAll(/<xhtml:link\b[^>]*>/g)].map(([tag]) => [
          tag.match(/\bhreflang="([^"]+)"/)?.[1],
          tag.match(/\bhref="([^"]+)"/)?.[1],
        ]),
      ),
      expected,
      `Incorrect sitemap alternates for ${loc}`,
    );
  }
}
assert.deepEqual(
  [...listedUrls].sort(),
  [...sitemapUrls].sort(),
  "Sitemap routes must match generated non-404 pages",
);

for (const lang of ["es", "en"]) {
  const prefix = lang === "en" ? "en/" : "";
  const home = await read(dist, `${prefix}index.html`);
  assert.ok(home.includes('id="availability"'), `The ${lang} homepage needs its date search`);
  for (const [step, element] of [
    ["revisar/", "reservation-review"],
    ["resumen/", "reservation-summary"],
  ]) {
    const html = await read(dist, `${prefix}reservar/${step}index.html`);
    assert.ok(html.includes(`<${element}`), `The ${lang} ${element} step must always be available`);
    const copy = JSON.parse(html.match(/<script[^>]*data-copy[^>]*>(.*?)<\/script>/s)?.[1] ?? "{}");
    assert.ok(URL.canParse(copy.apiBase), `The ${lang} ${element} step needs an absolute API URL`);
  }
  const rooms = await read(dist, `${prefix}habitaciones/index.html`);
  assert.ok(
    rooms.includes('id="availability"') && rooms.includes("<astro-island"),
    `The ${lang} rooms page needs its date search`,
  );
  for (const room of ["king", "double", "family"])
    assert.ok(
      rooms.includes(`id="room-${room}-name"`),
      `The ${lang} rooms page must prerender the ${room} room for search engines`,
    );
  assert.doesNotMatch(
    rooms,
    /minPrice|priceRange|S\/\s?\d/,
    `${lang} rooms page must not state fixed prices`,
  );
}

const ogImage = await stat(new URL("og.jpg", dist));
assert.ok(ogImage.size > 0 && ogImage.size < 300_000, "og.jpg must stay under 300KB");

console.log(
  `Verified ${spanishPages.length * 2} localized pages, English 404 copy, ${listedUrls.size} sitemap URLs, and og.jpg.`,
);
