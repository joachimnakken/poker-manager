import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export interface Device {
  context: BrowserContext;
  page: Page;
}

/**
 * Each phone is a separate browser context, because identity lives in that device's
 * localStorage — which is exactly why this feature needed a server in the first place.
 */
export async function openDevice(
  browser: Browser,
  options?: { viewport?: { width: number; height: number } },
): Promise<Device> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  return { context, page };
}

export const PHONE = { width: 380, height: 780 };

/** Creates a tournament through the UI and returns its join code. */
export async function createTournament(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Tournament Name").fill(name);
  await page.getByRole("button", { name: "Create Tournament" }).click();
  await page.waitForURL(/\/tournament\/[A-Z0-9]+$/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  expect(code).toMatch(/^[A-Z0-9]{5}$/);
  return code;
}

/** The fixtures share one last name: profiles need two names, specs only vary the first. */
export function fullName(firstName: string): string {
  return `${firstName} Test`;
}

export async function addPlayer(page: Page, firstName: string): Promise<void> {
  await page.getByRole("button", { name: "+ Add Player" }).click();
  await page.getByLabel("First Name").fill(firstName);
  await page.getByLabel("Last Name").fill("Test");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(`[data-player-row="${fullName(firstName)}"]`).first()).toBeVisible();
}

export async function setSeatsPerTable(page: Page, code: string, seats: number): Promise<void> {
  await page.goto(`/tournament/${code}/settings`);
  const field = page.getByLabel("Seats per table");
  await field.fill(String(seats));
  await field.blur();
  await expect(page.getByText(`${seats} seats/table`)).toHaveCount(0); // not on this page
  await page.goto(`/tournament/${code}`);
}

/** Checks a phone in by first name (last name is the shared fixture one) and waits for its own view. */
export async function checkIn(page: Page, code: string, firstName: string): Promise<void> {
  await page.goto(`/t/${code}`);
  await page.getByPlaceholder("First name").fill(firstName);
  await page.getByPlaceholder("Last name").fill("Test");
  await page.getByRole("button", { name: "I'm in" }).click();
  // Fixture names sit one edit apart (Cap1/Cap2), which rightly trips the did-you-mean
  // prompt — every fixture player is a new person, so answer "I'm new" when asked.
  const newProfile = page.getByTestId("checkin-new-profile");
  await expect(page.getByText("Checked in as").or(newProfile).first()).toBeVisible({
    timeout: 10_000,
  });
  if (await newProfile.isVisible()) {
    await newProfile.click();
  }
  await expect(page.getByText("Checked in as")).toBeVisible();
  // Target the identity card: the name also appears in the field list below it.
  await expect(page.getByTestId("my-name")).toHaveText(fullName(firstName));
}

/** Reads state straight from the API — used to set up deterministic seating. */
export async function readState(page: Page, code: string) {
  return page.evaluate(async (joinCode) => {
    const response = await fetch(`/api/t/${joinCode}/state`, { cache: "no-store" });
    return response.json();
  }, code);
}

/** Issues a raw action with this device's own stored token, bypassing the UI. */
export async function rawAction(
  page: Page,
  code: string,
  action: unknown,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ joinCode, payload }) => {
      const identity = JSON.parse(window.localStorage.getItem("poker-identity") ?? "{}");
      const mine = identity[joinCode] ?? {};
      const response = await fetch(`/api/t/${joinCode}/action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-poker-token": mine.ownerToken ?? mine.playerToken ?? "",
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { joinCode: code, payload: action },
  );
}

export const SEATS_PER_TABLE = 5;

/**
 * The lowest free seat at a table. Throws rather than returning undefined, because a
 * silently-missing seat used to reach Postgres as a not-null violation and read as a
 * server bug when it was really the fixture running out of room.
 */
export function freeSeatAt(isFree: (seat: number) => boolean): number {
  for (let seat = 1; seat <= SEATS_PER_TABLE; seat++) {
    if (isFree(seat)) {
      return seat;
    }
  }
  throw new Error("no free seat at that table — raise SEATS_PER_TABLE in the fixture");
}

export async function deleteTournament(page: Page, code: string): Promise<void> {
  await page.evaluate(async (joinCode) => {
    const identity = JSON.parse(window.localStorage.getItem("poker-identity") ?? "{}");
    await fetch(`/api/t/${joinCode}`, {
      method: "DELETE",
      headers: { "x-poker-token": identity[joinCode]?.ownerToken ?? "" },
    });
  }, code);
}
