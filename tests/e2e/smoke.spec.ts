import { expect, test } from "@playwright/test";

test("core flow: live markets -> click instrument -> line and candle charts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  const spx = page.getByRole("link", { name: /S&P 500/ }).first();
  await expect(spx).toContainText(/\d,\d{3}\.\d{2}/, { timeout: 15_000 });

  // Quotes keep updating: a second poll lands within a few seconds.
  const firstPoll = page.waitForResponse((r) => r.url().includes("/api/quotes") && r.ok());
  await firstPoll;
  await page.waitForResponse((r) => r.url().includes("/api/quotes") && r.ok(), { timeout: 10_000 });

  await spx.click();
  await expect(page).toHaveURL(/\/q\/.SPX/);
  await expect(page.getByTestId("price-chart").locator("canvas").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("tab", { name: "Candles" }).click();
  await page.getByRole("tab", { name: "1Y" }).click();
  await expect(page.getByText(/past year/)).toBeVisible({ timeout: 15_000 });

  // Search a stock by name and open it.
  await page.getByRole("combobox").fill("apple");
  await page.getByRole("option", { name: /AAPL/ }).first().click();
  await expect(page).toHaveURL(/\/q\/AAPL/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Apple");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
