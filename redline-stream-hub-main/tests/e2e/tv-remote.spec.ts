import { expect, test, type Page } from "@playwright/test";

function mockJellyfin(page: Page) {
  return page.route("**/api/jellyfin/**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;

    if (pathname.includes("/api/jellyfin/item/")) {
      const id = pathname.split("/").pop() || "watch-item";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Id: id,
          Name: "Playwright Episode",
          Type: "Episode",
          SeriesId: "series-1",
          SeasonId: "season-1",
          UserData: { PlaybackPositionTicks: 0, PlayedPercentage: 0 },
        }),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/series/") && pathname.endsWith("/seasons")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Items: [{ Id: "season-1", Name: "Season 1" }] }),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/season/") && pathname.endsWith("/episodes")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          Items: [
            { Id: "ep-1", Name: "Episode 1", Type: "Episode", IndexNumber: 1 },
            { Id: "ep-2", Name: "Episode 2", Type: "Episode", IndexNumber: 2 },
            { Id: "ep-3", Name: "Episode 3", Type: "Episode", IndexNumber: 3 },
          ],
        }),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/progress/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }

    if (pathname.includes("/api/jellyfin/recent/movies")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ Id: "movie-1", Name: "Movie One", Type: "Movie" }]),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/continue-watching")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Items: [{ Id: "cw-1", Name: "Continue One", Type: "Movie" }] }),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/movies")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Items: [{ Id: "movie-2", Name: "Movie Two", Type: "Movie" }] }),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/series")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Items: [{ Id: "series-1", Name: "Series One", Type: "Series" }] }),
      });
      return;
    }

    if (pathname.includes("/api/jellyfin/stream/")) {
      await route.fulfill({ status: 200, contentType: "application/x-mpegURL", body: "#EXTM3U\n" });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Items: [] }) });
  });
}

test.beforeEach(async ({ page }) => {
  await mockJellyfin(page);
});

test("backing out of watch lands on browse with tv mode and a focusable target", async ({ page }) => {
  await page.goto("/watch/ep-1");
  await page.evaluate(() => window.sessionStorage.setItem("redline:last-browse-path", "/"));

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);

  await expect
    .poll(() =>
      page.evaluate(() => ({
        mode: document.body.dataset.controlMode,
        focusableActive: Boolean(document.activeElement?.classList.contains("focusable")),
      }))
    )
    .toEqual({ mode: "tv", focusableActive: true });
});

test("season panel supports remote up/down navigation", async ({ page }) => {
  await page.goto("/watch/ep-1");
  await page.waitForTimeout(400);

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  await page.keyboard.press("ArrowUp");
  await expect(page.locator("[data-tv-group='watch-season-panel']")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  const firstDown = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText || "");
  await page.keyboard.press("ArrowDown");
  const secondDown = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText || "");

  expect(firstDown).not.toEqual("");
  expect(secondDown).not.toEqual("");
  expect(secondDown).not.toEqual(firstDown);
});
