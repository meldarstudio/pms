// Box map of a rendered region, for matching a loading skeleton to loaded UI.
// Import from a Playwright script: `const { boxes, compare } = await import("<this file>")`.

/** Leaf boxes inside `selector`, relative to the region's top-left, in document order. */
export async function boxes(page, selector) {
  return page.locator(selector).first().evaluate((region) => {
    const origin = region.getBoundingClientRect();
    const round = (n) => Math.round(n * 10) / 10;
    const leaves = [];
    for (const el of region.querySelectorAll("*")) {
      const ownText = Array.from(el.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
      const leaf =
        ownText ||
        el.matches("[data-slot=skeleton], input, button, svg, img, [role=separator], hr");
      if (!leaf || (el.closest("svg") && el.tagName.toLowerCase() !== "svg")) continue;
      const box = el.getBoundingClientRect();
      // Screen-reader-only text renders 1x1; it never shows, so it never needs a match.
      if (box.width <= 1 && box.height <= 1) continue;
      leaves.push({
        kind: el.matches("[data-slot=skeleton]") ? "skeleton" : el.tagName.toLowerCase(),
        text: ownText ? el.textContent.trim().slice(0, 40) : undefined,
        x: round(box.left - origin.left),
        y: round(box.top - origin.top),
        w: round(box.width),
        h: round(box.height),
      });
    }
    return { width: round(origin.width), height: round(origin.height), leaves };
  });
}

/** Region size delta plus leaves pairwise in document order; prints a table. */
export function compare(loaded, skeleton) {
  console.log(
    `region  loaded ${loaded.width}x${loaded.height}  skeleton ${skeleton.width}x${skeleton.height}  Δh ${Math.round((skeleton.height - loaded.height) * 10) / 10}`,
  );
  const rows = Math.max(loaded.leaves.length, skeleton.leaves.length);
  for (let i = 0; i < rows; i++) {
    const a = loaded.leaves[i];
    const b = skeleton.leaves[i];
    const fmt = (l) => (l ? `${l.kind.padEnd(8)} y${l.y} h${l.h} x${l.x} w${l.w}` : "—");
    const dy = a && b ? `Δy ${Math.round((b.y - a.y) * 10) / 10}` : "";
    console.log(`${String(i).padStart(2)}  ${fmt(a).padEnd(42)} ${fmt(b).padEnd(42)} ${dy}  ${a?.text ?? ""}`);
  }
}
