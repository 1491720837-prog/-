import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.route("**/api/chat", async (route) => {
  const b = route.request().postDataJSON();
  let text = "测试回答";
  if (b.messages[0].content.includes("existingId")) {
    const g = JSON.parse(b.messages[1].content).groups;
    text = JSON.stringify({
      existingId: g[0]?.id || "",
      label: "深入解释",
      template: "深入浅出地解释选中内容。",
    });
  } else if (b.messages[0].content.includes("translations")) {
    text = JSON.stringify({
      translations: JSON.parse(b.messages[1].content).map((x) => ({
        id: x.id,
        text: "这是对应的中文段落。",
      })),
    });
  }
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ choices: [{ message: { content: text } }] }),
  });
});
await p.goto("http://127.0.0.1:4318");
await p.waitForSelector(".node");
await p.waitForTimeout(300);
const old = await p.locator('[data-node-id="thought"]').boundingBox();
await p.locator('[data-node-id="thought"] .node-header').hover();
await p.mouse.down();
await p.mouse.move(old.x + 130, old.y + 100, { steps: 10 });
await p.mouse.up();
const moved = await p.locator('[data-node-id="thought"]').boundingBox();
assert.ok(Math.abs(moved.y - old.y) > 20);
await p.locator("#fit-canvas").click();
const from = p.locator('[data-node-id="thought"] .port.out'),
  to = p.locator('[data-node-id="method"] .port.in');
await p.locator('[data-node-id="thought"]').hover();
const f = await from.boundingBox(),
  t = await to.boundingBox();
await p.mouse.move(f.x + 6, f.y + 6);
await p.mouse.down();
await p.mouse.move(t.x + 6, t.y + 6, { steps: 8 });
await p.mouse.up();
await p.waitForSelector("#confirm-connection");
await p.locator("#confirm-connection").click();
assert.equal(
  await p.locator('[data-node-id="method"] .node-level').textContent(),
  "L2",
);
await p.locator("#undo").click();
assert.equal(
  await p.locator('[data-node-id="method"] .node-level').textContent(),
  "L1",
);
for (let i = 0; i < 4; i++) {
  await p.locator('[data-node-id="thought"] [data-followup]').click();
  await p.locator("#followup-question").fill("请解释一下这个概念 " + i);
  await p.locator("#followup-form button").click();
  await p.waitForFunction(
    () => document.querySelectorAll(".node.busy").length === 0,
  );
  await p.waitForTimeout(120);
  await p.locator("#close-drawer").click();
  await p.locator("#fit-canvas").click();
}
await p.waitForSelector(".shortcut-offer");
await p.locator("[data-accept]").click();
await p.locator("#confirm-shortcut").click();
await p.locator("#settings-button").click();
assert.match(await p.locator("#shortcut-list").textContent(), /深入解释/);
await p.locator(".modal-close").click();
await p.locator("#export-button").click();
let promise = p.waitForEvent("download");
await p.locator("#export-png").click();
let dl = await promise;
await dl.saveAs("artifacts/export.png");
assert.ok((await readFile("artifacts/export.png")).length > 10000);
promise = p.waitForEvent("download");
await p.locator("#export-md").click();
dl = await promise;
await dl.saveAs("artifacts/notes.zip");
assert.equal(
  (await readFile("artifacts/notes.zip")).readUInt32LE(0),
  0x04034b50,
);
await p.locator(".modal-close").click();
await p.locator("#file-input").setInputFiles("artifacts/roundtrip.folio.json");
await p.waitForSelector("#restore-project");
const backup = p.waitForEvent("download");
await p.locator("#restore-project").click();
await backup;
await p.waitForSelector(".node-image");
assert.equal(await p.locator(".node").count(), 9);
await p.waitForTimeout(300);
await p.locator("#page-input").fill("1");
await p.locator("#page-input").press("Tab");
await p.waitForFunction(
  () => document.querySelector(".source-page")?.dataset.page === "1",
);
await p.waitForSelector(".textLayer span");
await p
  .locator(".textLayer span")
  .first()
  .evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    const b = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: b.left + 20,
        clientY: b.top + 12,
      }),
    );
  });
await p.waitForSelector("#selection-popup:not(.hidden)");
assert.equal(await p.locator(".node").count(), 10);
assert.equal(errors.length, 0, errors.join("\n"));
await p.screenshot({ path: "artifacts/pdf-selection.png" });
console.log(
  JSON.stringify({
    passed: [
      "dragging",
      "connect by dragging",
      "undo relationship",
      "fourth semantic question shortcut",
      "PNG export",
      "Markdown ZIP export",
      "restore project with documents/images",
      "real PDF text selection",
    ],
    errors,
  }),
);
await browser.close();
