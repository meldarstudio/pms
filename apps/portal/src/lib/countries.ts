const flagFiles = import.meta.glob<string>("/node_modules/country-flag-icons/3x2/*.svg", {
  query: "?no-inline",
  import: "default",
  eager: true,
});
const flagUrls = new Map(
  Object.entries(flagFiles).map(([path, url]) => [path.split("/").pop()!.replace(".svg", ""), url]),
);
const regionNames = new Intl.DisplayNames(["es"], { type: "region", fallback: "none" });
const regionsWithoutNationals = new Set(["EU", "AC", "IC", "TA"]);

export type Nationality = { code: string; name: string };

export const flagUrl = (code: string) => flagUrls.get(code);

export const nationalityName = (code: string) => regionNames.of(code) ?? code;

export const nationalities: Nationality[] = [...flagUrls.keys()]
  .flatMap((code) => {
    const name =
      /^[A-Z]{2}$/.test(code) && !regionsWithoutNationals.has(code) && regionNames.of(code);
    return name ? [{ code, name }] : [];
  })
  .sort((a, b) => a.name.localeCompare(b.name, "es"));
