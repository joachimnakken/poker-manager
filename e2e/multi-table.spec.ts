import { expect, test, type Page } from "@playwright/test";
import {
  PHONE,
  SEATS_PER_TABLE,
  addPlayer,
  checkIn,
  createTournament,
  deleteTournament,
  freeSeatAt,
  fullName,
  openDevice,
  rawAction,
  readState,
} from "./helpers";

interface Seat {
  playerId: string;
  table: number;
  seat: number;
}

interface StatePlayer {
  id: string;
  name: string;
  isActive: boolean;
  finishPosition?: number;
}

async function seatsAndPlayers(page: Page, code: string) {
  const state = await readState(page, code);
  const players = state.tournament.players as StatePlayer[];
  const seats = (state.tournament.seatAssignments ?? []) as Seat[];
  // Player names are stored as "First Last"; specs pass either form.
  const idOf = (name: string) =>
    (players.find((p) => p.name === name) ?? players.find((p) => p.name === fullName(name)))!.id;
  const seatOf = (name: string) => seats.find((s) => s.playerId === idOf(name))!;
  return { state, players, seats, idOf, seatOf };
}

/**
 * The seat draw is random, so the spec pushes the two captains onto different tables
 * before starting. Five seats a table for six players leaves both tables with room even
 * after that shuffle, which is what keeps every later move possible.
 */
async function splitAcrossTables(page: Page, code: string, a: string, b: string) {
  const { seats, idOf, seatOf } = await seatsAndPlayers(page, code);
  if (seatOf(a).table === seatOf(b).table) {
    const target = seatOf(a).table === 1 ? 2 : 1;
    const taken = new Set(seats.filter((s) => s.table === target).map((s) => s.seat));
    const free = freeSeatAt((seat) => !taken.has(seat))!;
    const moved = await rawAction(page, code, {
      type: "move-player",
      playerId: idOf(b),
      toTable: target,
      toSeat: free,
    });
    expect(moved.status).toBe(200);
  }
  const after = await seatsAndPlayers(page, code);
  expect(after.seatOf(a).table).not.toBe(after.seatOf(b).table);
}

/** Six players: two on phones as captains, one uninvolved phone as a spectator. */
async function setUpNight(browser: Parameters<typeof openDevice>[0], name: string) {
  const host = await openDevice(browser);
  const cap1 = await openDevice(browser, { viewport: PHONE });
  const cap2 = await openDevice(browser, { viewport: PHONE });
  const spectator = await openDevice(browser, { viewport: PHONE });

  const code = await createTournament(host.page, name);

  await host.page.goto(`/tournament/${code}/settings`);
  const seatsField = host.page.getByLabel("Seats per table");
  await seatsField.fill(String(SEATS_PER_TABLE));
  await seatsField.blur();
  await host.page.goto(`/tournament/${code}`);

  await checkIn(cap1.page, code, "Cap1");
  await checkIn(cap2.page, code, "Cap2");
  for (const player of ["Ann", "Ben", "Cid", "Dot"]) {
    await addPlayer(host.page, player);
  }

  await host.page.getByRole("tab", { name: "Seating" }).click();
  await host.page.getByRole("button", { name: /Draw Seats|Redraw/ }).click();
  await expect
    .poll(
      async () => (await readState(host.page, code)).tournament.seatAssignments?.length ?? 0,
      { timeout: 10_000 },
    )
    .toBe(6);

  await splitAcrossTables(host.page, code, "Cap1", "Cap2");

  const { seatOf } = await seatsAndPlayers(host.page, code);
  const cap1Table = seatOf("Cap1").table;
  const cap2Table = seatOf("Cap2").table;

  // Both captains claim their own table from their own phone.
  for (const [device, table] of [
    [cap1, cap1Table],
    [cap2, cap2Table],
  ] as const) {
    const claimed = await rawAction(device.page, code, { type: "claim-captaincy", tableNumber: table });
    expect(claimed.status).toBe(200);
  }

  await host.page.getByRole("button", { name: "Start Tournament" }).click();
  await expect(host.page.getByTestId("players-left")).toHaveText("6/6");

  // The spectator never checks in, so it sees the whole field read-only.
  await spectator.page.goto(`/t/${code}`);
  await expect(spectator.page.getByTestId("players-left")).toHaveText("6/6");

  for (const device of [cap1, cap2]) {
    await device.page.reload();
    await expect(device.page.getByTestId("players-left")).toHaveText("6/6");
  }

  return { host, cap1, cap2, spectator, code, cap1Table, cap2Table };
}

test("a captain's knockout reaches all four devices, and positions stay one sequence", async ({
  browser,
}) => {
  const night = await setUpNight(browser, "Four Context Night");
  const { host, cap1, cap2, spectator, code, cap1Table } = night;

  const { players, seats, idOf } = await seatsAndPlayers(host.page, code);
  const victim = players.find(
    (p) => p.name !== fullName("Cap1") && seats.find((s) => s.playerId === p.id)?.table === cap1Table,
  )!;

  // Recorded on captain 1's phone, through the UI, at their own table.
  await cap1.page.getByTestId(`ko-${victim.name}`).click();
  await cap1.page.getByTestId(`ko-by-${victim.name}`).selectOption(idOf("Cap1"));

  // The writer's own view updates from the action response, so this marks the moment
  // the knockout is committed — the plan's 3-second budget for the other devices
  // starts here, not at the click, because the write itself rides a WAN round trip
  // locally that production (Vercel and Neon in the same region) does not pay.
  await expect(cap1.page.getByTestId("players-left")).toHaveText("5/6", { timeout: 15_000 });

  // All three watching devices, concurrently, each within 3 seconds of the commit.
  await Promise.all(
    [host.page, cap2.page, spectator.page].map((page) =>
      expect(page.getByTestId("players-left")).toHaveText("5/6", { timeout: 3000 }),
    ),
  );

  // Six players, first out, so sixth place — on every device that lists them.
  for (const page of [host.page, cap1.page, spectator.page]) {
    await expect(page.locator(`[data-finish-position="${victim.name}"]`).first()).toHaveText("#6", {
      timeout: 3000,
    });
  }

  // Bust the rest and confirm one unbroken 1..6 sequence across both tables.
  const state = await readState(host.page, code);
  const remaining = (state.tournament.players as StatePlayer[]).filter(
    (p) => p.isActive && p.id !== victim.id,
  );
  for (const player of remaining.slice(0, remaining.length - 1)) {
    const result = await rawAction(host.page, code, { type: "knockout", playerId: player.id });
    expect(result.status).toBe(200);
  }

  const final = await readState(host.page, code);
  expect(final.tournament.status).toBe("finished");
  const positions = (final.tournament.players as StatePlayer[])
    .map((p) => p.finishPosition)
    .sort((a, b) => (a ?? 0) - (b ?? 0));
  expect(positions).toEqual([1, 2, 3, 4, 5, 6]);

  await deleteTournament(host.page, code);
});

test("a captain cannot write across tables, and the API says so", async ({ browser }) => {
  const night = await setUpNight(browser, "Scope Night");
  const { host, cap1, code, cap2Table } = night;

  const { players, seats } = await seatsAndPlayers(host.page, code);
  const theirs = players.find(
    (p) => seats.find((s) => s.playerId === p.id)?.table === cap2Table,
  )!;

  // Not merely a hidden button: the request itself is refused.
  const crossTable = await rawAction(cap1.page, code, { type: "knockout", playerId: theirs.id });
  expect(crossTable.status).toBe(403);

  const hostOnly = await rawAction(cap1.page, code, { type: "next-level" });
  expect(hostOnly.status).toBe(403);

  const state = await readState(host.page, code);
  expect((state.tournament.players as StatePlayer[]).every((p) => p.isActive)).toBe(true);

  await deleteTournament(host.page, code);
});

test("the derived clock agrees across devices, and pausing on one pauses all", async ({
  browser,
}) => {
  const night = await setUpNight(browser, "Clock Night");
  const { host, cap1, spectator, code } = night;

  const read = async (page: Page) => {
    const text = await page.locator(".font-mono.font-bold").first().innerText();
    const [minutes, seconds] = text.trim().split(":").map(Number);
    return minutes * 60 + seconds;
  };

  await expect(host.page.locator(".font-mono.font-bold").first()).toBeVisible();
  const readings = await Promise.all([read(host.page), read(cap1.page), read(spectator.page)]);
  const spread = Math.max(...readings) - Math.min(...readings);
  expect(spread, `readings ${readings.join(", ")}`).toBeLessThanOrEqual(1);

  // Pause from the host; the phones follow within a poll.
  await host.page.locator("button", { has: host.page.locator("svg") }).nth(0);
  const paused = await rawAction(host.page, code, { type: "pause" });
  expect(paused.status).toBe(200);

  for (const page of [cap1.page, spectator.page]) {
    await expect(page.getByText("Paused", { exact: true })).toBeVisible({ timeout: 4000 });
  }

  const frozen = await read(cap1.page);
  await cap1.page.waitForTimeout(2500);
  expect(await read(cap1.page)).toBe(frozen);

  await deleteTournament(host.page, code);
});

test("a move applies only after the second captain confirms", async ({ browser }) => {
  const night = await setUpNight(browser, "Handshake Night");
  const { host, cap1, cap2, code, cap1Table, cap2Table } = night;

  const { players, seats, idOf, seatOf } = await seatsAndPlayers(host.page, code);
  const mover = players.find(
    (p) => p.name !== fullName("Cap1") && seats.find((s) => s.playerId === p.id)?.table === cap1Table,
  )!;
  const taken = new Set(seats.filter((s) => s.table === cap2Table).map((s) => s.seat));
  const freeSeat = freeSeatAt((seat) => !taken.has(seat))!;

  // The host proposes. Both tables are claimed, so the host confirms neither side.
  const proposed = await host.page.evaluate(
    async ({ joinCode, payload }) => {
      const identity = JSON.parse(window.localStorage.getItem("poker-identity") ?? "{}");
      const response = await fetch(`/api/t/${joinCode}/proposal`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-poker-token": identity[joinCode].ownerToken,
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status };
    },
    {
      joinCode: code,
      payload: {
        op: "create",
        playerId: mover.id,
        fromTable: cap1Table,
        fromSeat: seatOf(mover.name).seat,
        toTable: cap2Table,
        toSeat: freeSeat,
      },
    },
  );
  expect(proposed.status).toBe(200);

  // Both captains are asked, and the player has not moved yet.
  for (const device of [cap1, cap2]) {
    await expect(device.page.getByTestId("phone-proposal")).toBeVisible({ timeout: 4000 });
  }
  expect((await seatsAndPlayers(host.page, code)).seatOf(mover.name).table).toBe(cap1Table);

  await cap1.page.getByTestId("confirm-proposal").click();
  await expect(cap2.page.getByTestId("phone-proposal")).toBeVisible();
  // One confirm is not enough — wait out a full poll cycle and check nothing moved.
  await host.page.waitForTimeout(3000);
  expect((await seatsAndPlayers(host.page, code)).seatOf(mover.name).table).toBe(cap1Table);

  await cap2.page.getByTestId("confirm-proposal").click();
  await expect
    .poll(async () => (await seatsAndPlayers(host.page, code)).seatOf(mover.name).table, {
      timeout: 20_000,
    })
    .toBe(cap2Table);

  expect(idOf("Cap1")).toBeTruthy();
  await deleteTournament(host.page, code);
});

test("a move into an unclaimed table completes on the host's single confirm", async ({
  browser,
}) => {
  const night = await setUpNight(browser, "Fallback Night");
  const { host, cap1, code, cap1Table, cap2Table } = night;

  // Nobody is captain of the destination table any more, so the host speaks for it.
  const released = await rawAction(host.page, code, {
    type: "assign-captain",
    tableNumber: cap2Table,
    playerId: null,
  });
  expect(released.status).toBe(200);

  const { players, seats, seatOf } = await seatsAndPlayers(host.page, code);
  const mover = players.find(
    (p) => p.name !== fullName("Cap1") && seats.find((s) => s.playerId === p.id)?.table === cap1Table,
  )!;
  const taken = new Set(seats.filter((s) => s.table === cap2Table).map((s) => s.seat));
  const freeSeat = freeSeatAt((seat) => !taken.has(seat))!;

  // Captain 1 proposes; their own side is confirmed by proposing it.
  const proposed = await cap1.page.evaluate(
    async ({ joinCode, payload }) => {
      const identity = JSON.parse(window.localStorage.getItem("poker-identity") ?? "{}");
      const response = await fetch(`/api/t/${joinCode}/proposal`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-poker-token": identity[joinCode].playerToken,
        },
        body: JSON.stringify(payload),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    {
      joinCode: code,
      payload: {
        op: "create",
        playerId: mover.id,
        fromTable: cap1Table,
        fromSeat: seatOf(mover.name).seat,
        toTable: cap2Table,
        toSeat: freeSeat,
      },
    },
  );
  expect(proposed.status).toBe(200);

  // The host is the destination's fallback confirmer, so one click finishes it.
  await expect(host.page.getByTestId("pending-proposal")).toBeVisible({ timeout: 4000 });
  await host.page.getByRole("button", { name: "Confirm" }).click();

  await expect
    .poll(async () => (await seatsAndPlayers(host.page, code)).seatOf(mover.name).table, {
      timeout: 20_000,
    })
    .toBe(cap2Table);

  await deleteTournament(host.page, code);
});

test("the phone renders every lifecycle status at 380px with no sideways scroll", async ({
  browser,
}) => {
  const host = await openDevice(browser);
  const phone = await openDevice(browser, { viewport: PHONE });
  const projector = await openDevice(browser);
  const code = await createTournament(host.page, "Lifecycle Night");

  // The projector's pre-start wall: QR + whoever has checked in, nothing else.
  await projector.page.goto(`/display/${code}`);
  await expect(projector.page.getByTestId("prestart-qr")).toBeVisible();

  const noOverflow = async () => {
    const overflow = await phone.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(0);
  };

  // setup, before check-in
  await phone.page.goto(`/t/${code}`);
  await expect(phone.page.getByRole("button", { name: "I'm in" })).toBeVisible();
  await noOverflow();

  // setup, checked in and waiting for the draw
  await checkIn(phone.page, code, "Solo");
  await expect(phone.page.getByText("Waiting for the host to draw seats…")).toBeVisible();
  await noOverflow();

  // ...and the name floats onto the projector within a poll.
  await expect(projector.page.getByText(fullName("Solo"), { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(projector.page.getByText(/1 checked in/)).toBeVisible();

  // setup, seat drawn
  await addPlayer(host.page, "Pair");
  await host.page.getByRole("tab", { name: "Seating" }).click();
  await host.page.getByRole("button", { name: /Draw Seats|Redraw/ }).click();
  await expect(phone.page.getByTestId("my-seat")).toBeVisible({ timeout: 8000 });
  await noOverflow();

  // running
  await host.page.getByRole("button", { name: "Start Tournament" }).click();
  await expect(phone.page.getByTestId("players-left")).toHaveText("2/2", { timeout: 8000 });
  await noOverflow();

  // Starting flips the projector from the QR wall to live play.
  await expect(projector.page.getByTestId("prestart-qr")).not.toBeVisible({ timeout: 8000 });
  await expect(projector.page.getByText(/^Level \d/).first()).toBeVisible();

  // the standalone clock layout, remembered per device
  await phone.page.getByRole("button", { name: "Clock" }).click();
  await expect(phone.page.locator(".font-mono.font-bold").first()).toBeVisible();
  await noOverflow();
  await phone.page.reload();
  await expect(phone.page.locator(".font-mono.font-bold").first()).toBeVisible();
  await noOverflow();
  await phone.page.getByRole("button", { name: "Table" }).click();

  // busted, then finished — with two players a bust ends the tournament outright
  const { idOf } = await seatsAndPlayers(host.page, code);
  const busted = await rawAction(host.page, code, { type: "knockout", playerId: idOf("Solo") });
  expect(busted.status).toBe(200);
  await expect(phone.page.getByTestId("my-finish-position")).toHaveText("#2", { timeout: 8000 });
  await noOverflow();
  await expect(phone.page.getByText("Final standings")).toBeVisible();
  await noOverflow();

  // The finished night flows into career stats: Pair took it down, so their profile
  // shows at least one win. Asserted before the delete, which would erase the night.
  const stats = await phone.page.evaluate(async () => {
    const response = await fetch("/api/stats", { cache: "no-store" });
    return response.json() as Promise<{
      leaderboard: { firstName: string; lastName: string; wins: number; nights: number }[];
    }>;
  });
  const winner = stats.leaderboard.find(
    (entry) => `${entry.firstName} ${entry.lastName}` === fullName("Pair"),
  );
  expect(winner, "winner has a profile on the leaderboard").toBeTruthy();
  expect(winner!.wins).toBeGreaterThanOrEqual(1);
  expect(winner!.nights).toBeGreaterThanOrEqual(1);

  await deleteTournament(host.page, code);
});
