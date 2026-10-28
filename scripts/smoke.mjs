import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:4318");
await page.waitForSelector(".node");
await page.waitForTimeout(700);
await page.screenshot({ path: "artifacts/first-look.png" });
console.log(
  JSON.stringify({
    title: await page.title(),
    nodes: await page.locator(".node").count(),
    errors,
  }),
);
await browser.close();
