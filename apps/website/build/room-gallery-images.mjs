import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import sharp from "sharp";

const query = "?room-gallery";
const virtual = "\0room-gallery:";
const moduleSuffix = ":module";

export function roomGalleryImages() {
  const directory = resolve(import.meta.dirname, "../node_modules/.cache/room-gallery");
  const sizes = "(min-width: 80rem) 25rem, (min-width: 64rem) 32vw, (min-width: 48rem) 48vw, 100vw";
  const widths = [480, 720, 960, 1280];

  return {
    name: "room-gallery-images",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith(query)) return;
      const image = await this.resolve(source.slice(0, -query.length), importer, {
        skipSelf: true,
      });
      if (image) return `${virtual}${image.id}${moduleSuffix}`;
    },
    async load(id) {
      if (!id.startsWith(virtual)) return;
      const source = id.slice(virtual.length, -moduleSuffix.length);
      this.addWatchFile(source);
      const input = await readFile(source);
      const { width } = await sharp(input).metadata();
      const hash = createHash("sha256").update(input).digest("hex").slice(0, 12);
      await mkdir(directory, { recursive: true });
      const cardWidths = [...new Set(widths.map((size) => Math.min(size, width)))];
      const variants = [...cardWidths.map((size) => [size, 80]), [Math.min(width, 2400), 85]];
      const files = await Promise.all(
        variants.map(async ([size, quality]) => {
          const file = resolve(
            directory,
            `${basename(source, ".webp")}.${hash}-${size}-${quality}.webp`,
          );
          await writeFile(file, await sharp(input).resize(size).webp({ quality }).toBuffer());
          return file;
        }),
      );
      return [
        `import original from ${JSON.stringify(source)};`,
        ...files.map((file, index) => `import v${index} from ${JSON.stringify(`${file}?url`)};`),
        `export default { original, src: v${cardWidths.length - 1}, sizes: ${JSON.stringify(sizes)},`,
        `srcSet: [${cardWidths.map((size, index) => `v${index} + " ${size}w"`).join(", ")}].join(", "),`,
        `full: v${cardWidths.length} };`,
      ].join("\n");
    },
  };
}
