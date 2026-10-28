import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
let fail = false;
await page.route("**/api/chat", async (route) => {
  const b = route.request().postDataJSON();
  requests.push(b);
  if (fail)
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "测试：服务暂不可用" }),
    });
  let answer = "这是测试模型的回答：主动阅读需要提问、联系和证据。";
  if (b.messages[0].content.includes("translations")) {
    answer = JSON.stringify({
      translations: JSON.parse(b.messages[1].content).map((x) => ({
        id: x.id,
        text: "中文翻译：" + x.text,
      })),
    });
  } else if (b.messages[0].content.includes("existingId")) {
    const g = JSON.parse(b.messages[1].content).groups;
    answer = JSON.stringify({
      existingId: g[0]?.id || "",
      label: "通俗解释",
      template: "用通俗中文解释选中内容并举例。",
    });
  }
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ choices: [{ message: { content: answer } }] }),
  });
});
await page.goto("http://127.0.0.1:4318");
await page.waitForSelector(".node");
await page.waitForTimeout(300);
assert.equal(await page.locator(".node").count(), 5);
async function selectText(selector, start = 0, end = 55) {
  await page.locator(selector).evaluate(
    (el, { start, end }) => {
      const text = el.firstChild;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, Math.min(end, text.length));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      const b = el.getBoundingClientRect();
      el.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          clientX: b.left + 80,
          clientY: b.top + 20,
        }),
      );
    },
    { start, end },
  );
  await page.waitForSelector("#selection-popup:not(.hidden)");
}
await selectText('#english-paper [data-section="abstract"]');
assert.equal(await page.locator(".node").count(), 6);
await page.locator("#selection-question").fill("用简单的话解释一下");
await page.locator("#selection-question-form button").click();
await page.waitForFunction(
  () => document.querySelectorAll(".node.busy").length === 0,
);
assert.equal(await page.locator(".node").count(), 6);
assert.equal(
  await page.locator(".node.selected .node-kind").textContent(),
  "AI",
);
const aiId = await page.locator(".node.selected").getAttribute("data-node-id");
await page.locator(".node.selected [data-followup]").click();
await page.locator("#followup-question").fill("能给我一个例子吗");
await page.locator("#followup-form button").click();
await page.waitForFunction(
  () => document.querySelectorAll(".node.busy").length === 0,
);
assert.equal(await page.locator(".node").count(), 7);
assert.match(
  requests
    .at(-2)
    ?.messages?.map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("") || JSON.stringify(requests),
  /主动阅读|原问题/,
);
await page.locator("#close-drawer").click();
await page.locator(`[data-collapse="${aiId}"]`).click();
assert.equal(await page.locator(".node").count(), 6);
await page.locator(`[data-collapse="${aiId}"]`).click();
assert.equal(await page.locator(".node").count(), 7);
await page.locator("#new-note").click();
await page.locator("#edit-title").fill("独立的测试想法");
await page.locator("#edit-text").click();
await page.locator("#edit-text").fill("需要保存的内容");
await page.locator("#edit-title").click();
await page.locator("#close-drawer").click();
assert.equal(await page.locator(".node").count(), 8);
await page.locator("#context-button").click();
await page.locator("#context-scope").selectOption("all");
assert.match(
  await page.locator("#context-preview").inputValue(),
  /原文摘录|AI 回答/,
);
assert.match(
  await page.locator("#context-preview").inputValue(),
  /需要保存的内容/,
);
await page.locator(".modal-close").click();
await page
  .locator("#file-input")
  .setInputFiles("artifacts/reading-fixture.pdf");
await page.waitForSelector("#english-paper canvas");
await page.waitForSelector(".translation-block");
await page.waitForFunction(() =>
  !document.querySelector("#translation-progress").classList.contains("hidden")
    ? document
        .querySelector("#translate-button")
        .textContent.includes("翻译全文")
    : true,
);
await page.waitForTimeout(700);
assert.ok((await page.locator(".textLayer span").count()) > 5);
assert.ok((await page.locator(".translation-block").count()) > 4);
await page.screenshot({ path: "artifacts/pdf-test.png" });
await page.locator("#crop-button").click();
const box = await page.locator(".crop-overlay").boundingBox();
await page.mouse.move(box.x + 45, box.y + 190);
await page.mouse.down();
await page.mouse.move(box.x + 210, box.y + 320, { steps: 8 });
await page.mouse.up();
assert.equal(await page.locator(".node-image").count(), 1);
await page.locator("#next-page").click();
await page.waitForFunction(
  () => document.querySelector(".source-page")?.dataset.page === "2",
);
await page.waitForTimeout(250);
assert.equal(await page.locator("#page-input").inputValue(), "2");
await page.waitForTimeout(500);
await page.reload();
await page.waitForSelector(".node-image");
assert.equal(await page.locator("#page-input").inputValue(), "2");
assert.equal(await page.locator(".node").count(), 9);
await page.locator("#export-button").click();
const dl = page.waitForEvent("download");
await page.locator("#export-project").click();
const file = await dl;
await file.saveAs("artifacts/roundtrip.folio.json");
const backup = JSON.parse(
  await readFile("artifacts/roundtrip.folio.json", "utf8"),
);
assert.equal(backup.nodes.length, 9);
assert.equal(backup.docs.length, 2);
assert.ok(backup.docs[1].data);
assert.equal(backup.config, undefined);
await page.locator(".modal-close").click();
await page.locator("#library-button").click();
await page.locator('[data-doc="demo"]').click();
fail = true;
await selectText('#english-paper [data-section="abstract"]', 60, 100);
const original = await page.locator(".node.selected .node-body").textContent();
await page.locator("#summarize").click();
await page.waitForSelector(".node-error");
assert.equal(
  await page.locator(".node.selected .node-body").textContent(),
  original,
);
assert.equal(
  await page.locator(".node.selected .node-kind").textContent(),
  "摘录",
);
assert.equal(errors.length, 0, errors.join("\n"));
console.log(
  JSON.stringify({
    passed: [
      "demo",
      "automatic excerpt",
      "AI replaces same node",
      "follow-up",
      "collapse",
      "editing",
      "context scope",
      "PDF upload",
      "PDF translation route",
      "crop image",
      "page navigation",
      "persistence",
      "project export",
      "AI failure preserves excerpt",
    ],
    errors,
    requests: requests.length,
  }),
);
await browser.close();
