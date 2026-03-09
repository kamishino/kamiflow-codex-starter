import { expect, test } from "@playwright/test";
import { seededPlans, withKfpServer } from "./fixtures.js";

function capturePageErrors(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.message || error));
  });
  return pageErrors;
}

test("renders the empty state when no plans exist", async ({ page }) => {
  await withKfpServer({ plans: [] }, async ({ baseUrl }) => {
    const pageErrors = capturePageErrors(page);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#work-surface").getByText("No plan selected.")).toBeVisible();
    await expect(page.locator("#work-surface").getByText("Choose a plan from the toolbar plan picker.")).toBeVisible();
    await expect(page.locator("#plan-selection-help")).toContainText("Selected plan: none.");
    expect(pageErrors).toEqual([]);
    await page.close();
  });
});

test("hydrates the default selected plan into the main and side rail layout", async ({ page }) => {
  await withKfpServer({ plans: seededPlans() }, async ({ baseUrl }) => {
    const pageErrors = capturePageErrors(page);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#plan-selection-help")).toContainText("PLAN-2026-03-07-101");
    await expect(page.getByRole("heading", { name: "Implementation Plan Status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Phase Timeline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Execution Timeline" })).toBeVisible();
    await expect(page.locator(".snapshot-state-card")).toBeVisible();
    await expect(page.locator(".side-rail")).toBeVisible();

    const layout = await page.evaluate(() => {
      const main = document.querySelector(".main")?.getBoundingClientRect();
      const rail = document.querySelector(".side-rail")?.getBoundingClientRect();
      return {
        sameRow: !!(main && rail && Math.abs(main.top - rail.top) < 40),
        railOnRight: !!(main && rail && rail.left > main.left + main.width * 0.5)
      };
    });

    expect(layout.sameRow).toBe(true);
    expect(layout.railOnRight).toBe(true);
    expect(pageErrors).toEqual([]);
    await page.close();
  });
});

test("supports plan picker switching and closes results after outside click", async ({ page }) => {
  await withKfpServer({ plans: seededPlans() }, async ({ baseUrl }) => {
    const pageErrors = capturePageErrors(page);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#plan-selection-help")).toContainText("PLAN-2026-03-07-101");

    const searchInput = page.locator("#plan-search-input");
    const results = page.locator("#plan-search-results");

    await searchInput.click();
    await expect(results).toBeVisible();

    await searchInput.fill("secondary");
    await expect(results.getByRole("button")).toHaveCount(1);
    await results.getByRole("button").click();

    await expect(page.locator("#plan-selection-help")).toContainText("PLAN-2026-03-07-102");
    await expect(results).toBeHidden();

    await searchInput.click();
    await expect(results).toBeVisible();
    await page.locator("body").click({ position: { x: 8, y: 8 } });
    await expect(results).toBeHidden();
    expect(pageErrors).toEqual([]);
    await page.close();
  });
});

test("switches theme preference and toggles the compact phase timeline", async ({ page }) => {
  await withKfpServer({ plans: seededPlans() }, async ({ baseUrl }) => {
    const pageErrors = capturePageErrors(page);

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#plan-selection-help")).toContainText("PLAN-2026-03-07-101");

    await page.selectOption("#theme-preference", "dark");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");

    await page.selectOption("#theme-preference", "light");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");

    await page.selectOption("#theme-preference", "system");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themePreference)).toBe("system");

    const expandButton = page.getByRole("button", { name: "Show full timeline" });
    await expect(expandButton).toBeVisible();
    await expandButton.click();
    await expect(page.getByRole("list", { name: "Phase timeline" })).toBeVisible();

    await page.getByRole("button", { name: "Hide full timeline" }).click();
    await expect(page.getByRole("list", { name: "Phase timeline" })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    await page.close();
  });
});
