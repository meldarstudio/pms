const flagFiles = import.meta.glob<string>("/node_modules/country-flag-icons/3x2/*.svg", {
  query: "?no-inline",
  import: "default",
  eager: true,
});

const flagUrls = new Map(
  Object.entries(flagFiles).map(([path, url]) => [path.split("/").pop()!.replace(".svg", ""), url]),
);

export const flagUrl = (code: string) => flagUrls.get(code);
