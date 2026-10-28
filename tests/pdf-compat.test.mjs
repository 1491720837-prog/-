import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { MessageChannel, Worker } from "node:worker_threads";
import { PDFDocument, PDFHexString, StandardFonts } from "pdf-lib";

// Reproduce the user's browser without the new byte-encoding methods.
for (const key of ["toHex", "toBase64", "setFromHex", "setFromBase64"])
  delete Uint8Array.prototype[key];
for (const key of ["fromHex", "fromBase64"]) delete Uint8Array[key];
const pdfjs = await import("../dist/vendor/pdf.mjs");

test("bundled reader supports byte encodings without native browser methods", () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);
  assert.equal(bytes.toHex(), "00017f80ff");
  assert.equal(bytes.toBase64(), "AAF/gP8=");
  assert.deepEqual(Uint8Array.fromBase64("AAF/gP8="), bytes);
});

for (const hasFileId of [false, true]) {
  test(`PDF import and page extraction in an isolated compatible worker (file ID: ${hasFileId})`, { timeout: 15000 }, async () => {
    const input = await PDFDocument.create();
    const font = await input.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 2; i++)
      input.addPage().drawText(`Reading evidence on page ${i}`, { font });
    const fileId = "00112233445566778899aabbccddeeff";
    if (hasFileId)
      input.context.trailerInfo.ID = input.context.obj([
        PDFHexString.of(fileId),
        PDFHexString.of(fileId),
      ]);
    const data = await input.save();
    const fingerprint = hasFileId
      ? fileId
      : createHash("md5").update(data.subarray(0, 1024)).digest("hex");
    const { port1, port2 } = new MessageChannel();
    const thread = new Worker(new URL("./fixtures/pdf-compat-worker.mjs", import.meta.url), {
      workerData: {
        module: new URL("../dist/vendor/pdf.worker.mjs", import.meta.url).href,
        port: port2,
      },
      transferList: [port2],
    });
    const worker = pdfjs.PDFWorker.create({ port: port1 });
    const loading = pdfjs.getDocument({ data, worker, useSystemFonts: true });
    const failed = new Promise((_, reject) => thread.once("error", reject));
    try {
      const pdf = await Promise.race([loading.promise, failed]);
      assert.equal(pdf.numPages, 2);
      assert.equal(pdf.fingerprints[0], fingerprint);
      for (let i = 1; i <= 2; i++) {
        const page = await pdf.getPage(i);
        const text = await page.getTextContent();
        assert.match(text.items.map((item) => item.str).join(" "), new RegExp(`Reading evidence on page ${i}`));
        assert.ok((await page.getOperatorList()).fnArray.length > 0);
      }
    } finally {
      await loading.destroy();
      worker.destroy();
      port1.close();
      await thread.terminate();
    }
  });
}
