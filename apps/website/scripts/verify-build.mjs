import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";

const site = "https://www.hotelmanantialchurin.com";
const root = new URL("../", import.meta.url);
const dist = new URL("../.cloudflare/output/v1/workers/default/assets/", import.meta.url);

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
    { "es-PE": urls.es, "en-US": urls.en, "x-default": urls.es },
    "Page hreflang codes must match the sitemap's",
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
const retiredPages = {
  "/nosotros": "/",
  "/turismo": "/churin/",
  "/contacto": "/",
  "/contactenos": "/",
  "/cotiza": "/habitaciones/",
};
const expectedRedirects = Object.entries(retiredPages).flatMap(([from, to]) => [
  `${from} ${to} 301`,
  `${from}/ ${to} 301`,
]);
for (const file of spanishPages) {
  const slug = file.replace(/\.astro$/, "");
  const path = slug === "index" ? "" : `${slug.replace(/(^|\/)index$/, "")}/`;
  const urls = {
    es: `${site}/${path}`,
    en: `${site}/en/${path}`,
  };
  if (slug === "habitaciones") {
    sitemapUrls.add(urls.es);
    sitemapUrls.add(urls.en);
    expectedRedirects.push(`/habitaciones /habitaciones/ 301`, `/en/habitaciones /en/habitaciones/ 301`);
    continue;
  }
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
for (const target of Object.values(retiredPages)) {
  assert.ok(
    sitemapUrls.has(`${site}${target}`),
    `A retired page redirects to a page that is not built and indexed: ${target}`,
  );
}

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
      "x-default": `${site}/${path}`,
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
  const hotel = JSON.parse(
    home.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1] ?? "{}",
  );
  assert.equal(hotel["@type"], "Hotel", `The ${lang} homepage needs Hotel structured data`);
  assert.equal(hotel.starRating?.ratingValue, "3", "Hotel star rating must match Google's listing");
  assert.equal(hotel.hasOfferCatalog?.url, `${site}/${prefix}habitaciones/`);
  assert.equal(hotel.priceRange, undefined, "Rates are dynamic; Hotel must not state a priceRange");
  assert.doesNotMatch(JSON.stringify(hotel), /pool|piscina/i, "The hotel has no pool");
  assert.ok(hotel.image?.length > 0, `The ${lang} Hotel structured data needs photos`);
  for (const image of hotel.image) {
    const url = new URL(image);
    assert.equal(url.origin, site);
    assert.ok((await stat(new URL(`.${url.pathname}`, dist))).size > 0, `Missing ${image}`);
  }
  const review = await read(dist, `${prefix}reservar/revisar/index.html`);
  const reviewIsland = review.match(
    /<astro-island[^>]*component-url="[^"]*\/Review\.[^"]*"[^>]*>/,
  )?.[0];
  assert.ok(reviewIsland, `The ${lang} review step must always be available`);
  const reviewProps = JSON.parse(
    reviewIsland.match(/props="([^"]*)"/)?.[1].replaceAll("&quot;", '"') ?? "{}",
  );
  assert.ok(
    URL.canParse(reviewProps.apiBase?.[1]),
    `The ${lang} review step needs an absolute API URL`,
  );
  const summary = await read(dist, `${prefix}reservar/resumen/index.html`);
  assert.ok(
    summary.includes("<reservation-summary"),
    `The ${lang} reservation-summary step must always be available`,
  );
  const copy = JSON.parse(
    summary.match(/<script[^>]*data-copy[^>]*>(.*?)<\/script>/s)?.[1] ?? "{}",
  );
  assert.ok(
    URL.canParse(copy.apiBase),
    `The ${lang} reservation-summary step needs an absolute API URL`,
  );
}

const ogImage = await stat(new URL("og.jpg", dist));
assert.ok(ogImage.size > 0 && ogImage.size < 300_000, "og.jpg must stay under 300KB");

console.log(
  `Verified ${spanishPages.length * 2} localized pages, English 404 copy, ${listedUrls.size} sitemap URLs, and og.jpg.`,
);
