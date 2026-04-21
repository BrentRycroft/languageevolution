import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "public", "icon.svg");
const outDir = resolve(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(src);

const sizes = [
  { name: "icon-192.png", size: 192, padding: 0 },
  { name: "icon-512.png", size: 512, padding: 0 },
  { name: "icon-maskable-512.png", size: 512, padding: 64 },
  { name: "apple-touch-icon.png", size: 180, padding: 0 },
  { name: "favicon-32.png", size: 32, padding: 0 },
];

for (const { name, size, padding } of sizes) {
  const inner = size - padding * 2;
  const overlay = await sharp(svg).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: padding > 0 ? { r: 15, g: 17, b: 21, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: overlay, top: padding, left: padding }])
    .png()
    .toFile(resolve(outDir, name));
  console.log("wrote", name);
}
