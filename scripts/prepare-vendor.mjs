import { cp, mkdir } from "node:fs/promises";
await mkdir("dist/vendor", { recursive: true });
for (const name of [
  // Both realms need PDF.js's official polyfills (e.g. Uint8Array.toHex).
  // A modern worker still fails even when the main thread uses legacy.
  "legacy/build/pdf.mjs",
  "legacy/build/pdf.worker.mjs",
  "cmaps",
  "standard_fonts",
  "wasm",
  "web/pdf_viewer.css",
  "LICENSE",
])
  await cp(
    `node_modules/pdfjs-dist/${name}`,
    `dist/vendor/${name.split("/").at(-1)}`,
    { recursive: true },
  );
