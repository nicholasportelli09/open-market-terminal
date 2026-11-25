import { expect, test } from "@playwright/test";
test("mouse: drag measures, release clears, shift-drag pans", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/q/.SPX");
  const chart = page.getByTestId("price-chart");
  await expect(chart.locator("canvas").first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("tab", { name: "YTD" }).click();
  await expect(page.getByText(/year to date/)).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  const box = (await chart.boundingBox())!;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, y, { steps: 8 });
  const pill = page.getByTestId("chart-measure");
  await expect(pill).toBeVisible();
  await page.mouse.move(box.x + box.width * 0.1, y, { steps: 8 });
  await page.mouse.up();
  await expect(pill).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Scroll to latest bar" })).toHaveCount(0);
  // Shift + drag pans away from the latest bar.
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 10 });
  await expect(pill).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByRole("button", { name: "Scroll to latest bar" })).toBeVisible();
  // Then a plain drag measures again (not pans).
  await page.mouse.move(box.x + box.width * 0.6, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, y, { steps: 8 });
  await expect(pill).toBeVisible();
  await page.mouse.up();
});

test.describe("touch", () => {
  test.use({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  test("long-press then drag measures; a quick swipe does not", async ({ page }) => {
    await page.goto("/q/AAPL");
    const chart = page.getByTestId("price-chart");
    await expect(chart.locator("canvas").first()).toBeVisible({ timeout: 15000 });
    await page.getByRole("tab", { name: "1Y" }).click();
    await expect(page.getByText(/past year/)).toBeVisible({ timeout: 15000 });
    await chart.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const box = (await chart.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height * 0.5;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    // Quick swipe
    await touch("touchStart", box.x + box.width * 0.6);
    for (let i = 1; i <= 6; i++) await touch("touchMove", box.x + box.width * (0.6 - i * 0.05));
    // Still touching, well past the long-press time: a swipe never turns into a measure.
    await page.waitForTimeout(450);
    await touch("touchMove", box.x + box.width * 0.35);
    await expect(page.getByTestId("chart-measure")).toHaveCount(0);
    await touch("touchEnd", 0);
    await page.waitForTimeout(400);
    // Long press, then drag
    await touch("touchStart", box.x + box.width * 0.25);
    await page.waitForTimeout(450);
    for (let i = 1; i <= 8; i++) { await touch("touchMove", box.x + box.width * (0.25 + i * 0.06)); await page.waitForTimeout(16); }
    const pill = page.getByTestId("chart-measure");
    await expect(pill).toBeVisible();
    await touch("touchEnd", 0);
    await expect(pill).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBe(0);
  });
});
