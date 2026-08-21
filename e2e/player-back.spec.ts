import { expect, test } from "@playwright/test";
import {
  PHONE,
  addPlayer,
  checkIn,
  createTournament,
  deleteTournament,
  openDevice,
} from "./helpers";

/**
 * Installed, the player app has no browser chrome, so the reference screens were only
 * escapable by the invisible edge swipe. These assert the button that replaced it goes
 * where the swipe would have — and, on a cold launch, somewhere useful instead of out
 * of the app.
 */
test.describe("player back button", () => {
  test("returns to the screen you came from, whichever that was", async ({ browser }) => {
    const host = await openDevice(browser);
    const phone = await openDevice(browser, { viewport: PHONE });
    const code = await createTournament(host.page, "Back Button Night");

    try {
      await addPlayer(host.page, "Ann");
      await checkIn(phone.page, code, "Ben");

      // From the table view: back lands on the table, not on the app's start screen.
      await phone.page.goto(`/t/${code}`);
      await phone.page.getByTestId("nav-stats").click();
      await phone.page.waitForURL("**/stats");
      await phone.page.getByTestId("player-back").click();
      await phone.page.waitForURL(`**/t/${code}`);
    } finally {
      await deleteTournament(host.page, code);
      await host.context.close();
      await phone.context.close();
    }
  });

  test("returns to the start screen when that is where you came from", async ({ browser }) => {
    // A device that never joined stays on /play — one that has checked in gets redirected
    // straight into its tournament, which is why this needs its own device.
    const device = await openDevice(browser, { viewport: PHONE });
    try {
      await device.page.goto("/play");
      await device.page.getByTestId("nav-rankings").click();
      await device.page.waitForURL("**/rankings");
      await device.page.getByTestId("player-back").click();
      await device.page.waitForURL("**/play");
    } finally {
      await device.context.close();
    }
  });

  test("a cold launch onto a reference screen falls back to /play, not out of the app", async ({
    browser,
  }) => {
    const device = await openDevice(browser, { viewport: PHONE });
    try {
      // No in-app navigation has happened, so there is nothing behind this screen —
      // history.length says otherwise, which is exactly why it is not consulted.
      await device.page.goto("/showdown");
      await expect(device.page.getByTestId("player-back")).toBeVisible();
      await device.page.getByTestId("player-back").click();
      await device.page.waitForURL("**/play");
    } finally {
      await device.context.close();
    }
  });

  test("every reference screen carries one, at a thumb-sized target", async ({ browser }) => {
    const device = await openDevice(browser, { viewport: PHONE });
    try {
      for (const route of ["/rankings", "/showdown", "/stats", "/profile"]) {
        await device.page.goto(route);
        const back = device.page.getByTestId("player-back");
        await expect(back, `${route} has no back button`).toBeVisible();
        const box = await back.boundingBox();
        expect(box!.height, `${route} back target is under 44pt`).toBeGreaterThanOrEqual(44);
      }
    } finally {
      await device.context.close();
    }
  });
});
