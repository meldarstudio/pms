import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const pages = [
  "/",
  "/habitaciones/",
  "/churin/",
  "/404",
  "/en/",
  "/en/habitaciones/",
  "/en/churin/",
  "/en/404",
] as const;

function formatViolation(
  pagePath: string,
  violation: {
    id: string;
    help: string;
    nodes: { target: unknown }[];
  },
): string {
  const selectors = violation.nodes
    .map((node) => (Array.isArray(node.target) ? node.target.join(" ") : String(node.target)))
    .join(", ");
  return `[${pagePath}] ${violation.id}: ${violation.help} (selector: ${selectors})`;
}

async function runAxe(page: Page, pagePath: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const failing = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const warnings = results.violations.filter(
    (v) => v.impact === "moderate" || v.impact === "minor",
  );

  for (const warning of warnings) {
    console.warn(formatViolation(pagePath, warning));
  }

  if (failing.length > 0) {
    const details = failing.map((v) => formatViolation(pagePath, v)).join("\n");
    expect(failing, `Serious/critical a11y violations:\n${details}`).toEqual([]);
  }
}

for (const path of pages) {
  test(`a11y: ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok() || response?.status() === 404).toBeTruthy();
    await runAxe(page, path);
  });
}
