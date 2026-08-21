import { expect, test } from "@playwright/test";
import {
  addPlayer,
  backdateStart,
  createTournament,
  deleteTournament,
  openDevice,
  rawAction,
  readState,
} from "./helpers";

interface Level {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  duration: number;
  isBreak?: boolean;
}

/**
 * The nudge is time-dependent, so the spec cannot wait for a real 1am. It sets the target
 * finish time in the past through a raw action — the same state a host reaches by aiming
 * for 01:00 and still playing at 02:00 — and asserts the wiring rather than the arithmetic,
 * which `src/lib/pacing.test.ts` covers: that a start timestamp reaches the client, that the
 * card stays quiet until the break is behind, and that each remedy changes what it claims to.
 */
test.describe("pace nudge", () => {
  test("stays quiet until it has something to say, then speeds the night up", async ({
    browser,
  }) => {
    const host = await openDevice(browser);
    const page = host.page;
    const code = await createTournament(page, "Pace nudge");

    try {
      for (const name of ["Ann", "Ben", "Cid", "Dot"]) {
        await addPlayer(page, name);
      }

      // --- a start timestamp exists, which the clock anchor alone could not provide
      expect((await readState(page, code)).tournament.startedAt).toBeNull();
      expect((await rawAction(page, code, { type: "start" })).status).toBe(200);
      const started = (await readState(page, code)).tournament.startedAt;
      expect(started).not.toBeNull();
      expect(Number.isFinite(Date.parse(started as string))).toBe(true);

      const structure: Level[] = (await readState(page, code)).tournament.config.blindStructure;
      const firstBreak = structure.findIndex((level) => level.isBreak);
      expect(firstBreak).toBeGreaterThan(0);

      // --- silent with no target set, however long the night looks
      await page.goto(`/tournament/${code}`);
      await expect(page.getByTestId("pace-nudge")).toHaveCount(0);

      // --- silent while the first break is still ahead of us, even with a target set
      const targetFinishAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      expect(
        (await rawAction(page, code, { type: "update-config", config: { targetFinishAt } })).status,
      ).toBe(200);
      await page.reload();
      await expect(page.getByTestId("players-left")).toHaveText("4/4");
      await expect(page.getByTestId("pace-nudge")).toHaveCount(0);

      // --- walk past the break
      for (let index = 0; index <= firstBreak; index++) {
        expect((await rawAction(page, code, { type: "next-level" })).status).toBe(200);
      }
      const atLevel = (await readState(page, code)).tournament.timer.currentLevelIndex;
      expect(atLevel).toBeGreaterThan(firstBreak);

      // --- still silent: the night is minutes old, so there is no rate worth quoting
      await page.reload();
      await expect(page.getByTestId("pace-nudge")).toHaveCount(0);

      // --- age it to three hours of play with nobody out, and now it should speak up
      await backdateStart(code, 3 * 60 * 60 * 1000);
      await page.reload();
      const card = page.getByTestId("pace-nudge");
      await expect(card).toBeVisible();
      await expect(card).toContainText(/finish around \d{1,2}[:.]\d{2}/i);
      await expect(card).toContainText("Nobody out after 3h");

      // --- remedy one: cut the coming rounds, leaving everything already played alone
      const before: Level[] = (await readState(page, code)).tournament.config.blindStructure;
      await page.getByTestId("pace-cut-rounds").click();
      await expect
        .poll(
          async () =>
            ((await readState(page, code)).tournament.config.blindStructure as Level[])
              .map((level) => level.duration)
              .join(","),
          { timeout: 15_000 },
        )
        .not.toBe(before.map((level) => level.duration).join(","));

      const after: Level[] = (await readState(page, code)).tournament.config.blindStructure;
      expect(after).toHaveLength(before.length);

      let shortened = 0;
      after.forEach((level, index) => {
        const was = before[index];
        if (index <= atLevel || was.isBreak) {
          expect(level, `level ${index} must be untouched`).toEqual(was);
          return;
        }
        expect(level.duration).toBeLessThanOrEqual(was.duration);
        expect(level.duration % 60).toBe(0);
        expect(level.duration).toBeGreaterThanOrEqual(300);
        // Only the clock changes — the blinds themselves are not rewritten.
        expect({ ...level, duration: was.duration }).toEqual(was);
        if (level.duration < was.duration) {
          shortened += 1;
        }
      });
      expect(shortened, "at least one coming round must actually be shorter").toBeGreaterThan(0);

      // --- remedy two: raise the blinds now, which is exactly one level forward
      await page.getByTestId("pace-skip-level").click();
      await expect
        .poll(
          async () => (await readState(page, code)).tournament.timer.currentLevelIndex,
          { timeout: 15_000 },
        )
        .toBe(atLevel + 1);

      // --- a reset takes the start timestamp with it
      expect((await rawAction(page, code, { type: "reset" })).status).toBe(200);
      expect((await readState(page, code)).tournament.startedAt).toBeNull();
    } finally {
      await deleteTournament(page, code);
      await host.context.close();
    }
  });
});
