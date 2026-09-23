import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, test } from "vitest";
import { resetDb } from "@/lib/db";
import { DEFAULT_POINT_VALUE } from "@/lib/scoring";
import {
  addPlayer,
  createSession,
  deleteGame,
  getSession,
  saveOpenHand,
  setSeatPoints,
  setWinner,
  updateGame,
  viewSession,
  viewSessionByJoinCode,
} from "@/lib/sessions";
import type { DeviceAuth } from "@/lib/types";

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "rummy-"));
  process.env.RUMMY_DB_PATH = path.join(dir, "rummy.sqlite");
  resetDb();
});

afterEach(() => {
  resetDb();
});

type Seat = { name: string; playerId: string; seatCode: string };

function table(names: string[], pointValue = 1) {
  const created = createSession({ pointValue, name: names[0] });
  const seats: Seat[] = [
    {
      name: names[0]!,
      playerId: created.session.playerId!,
      seatCode: created.seatCode,
    },
  ];
  let version = created.session.version;
  for (const name of names.slice(1)) {
    const added = addPlayer(
      created.session.id,
      { seatCode: null, joinCode: created.session.joinCode },
      { name, version },
    );
    seats.push({
      name,
      playerId: added.session.playerId!,
      seatCode: added.seatCode,
    });
    version = added.session.version;
  }
  const adminAuth: DeviceAuth = { seatCode: seats[0]!.seatCode, joinCode: created.session.joinCode };
  return {
    id: created.session.id,
    joinCode: created.session.joinCode,
    seats,
    adminAuth,
    session: viewSession(created.session.id, adminAuth),
  };
}

function auth(seatCode: string): DeviceAuth {
  return { seatCode, joinCode: null };
}

function givePoints(id: string, seats: Seat[], points: Record<string, number>, version: number) {
  let current = version;
  for (const seat of seats) {
    const view = setSeatPoints(id, auth(seat.seatCode), {
      version: current,
      points: points[seat.name]!,
    });
    current = view.version;
  }
  return current;
}

function finishHand(
  id: string,
  seats: Seat[],
  adminAuth: DeviceAuth,
  points: Record<string, number>,
  winnerName: string,
  version: number,
  winnerPoints: number | null = null,
) {
  const scored = givePoints(id, seats, points, version);
  const winner = seats.find((seat) => seat.name === winnerName);
  if (!winner) throw new Error(`Missing ${winnerName}`);
  const withWinner = setWinner(id, adminAuth, {
    version: scored,
    winnerPlayerId: winner.playerId,
    winnerPoints,
  });
  return saveOpenHand(id, adminAuth, withWinner.version);
}

test("a pack and an 80-point hand update totals, and 66 is stored as 70", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo", "Chitra"]);
  const saved = finishHand(
    id,
    seats,
    adminAuth,
    { Anu: 0, Bo: 20, Chitra: 66 },
    "Anu",
    session.version,
  );

  const game = saved.games[0];
  expect(game?.scores).toEqual([
    { playerId: seats[0]!.playerId, points: -90 },
    { playerId: seats[1]!.playerId, points: 20 },
    { playerId: seats[2]!.playerId, points: 70 },
  ]);
  expect(game?.money).toBe(90);
  expect(saved.players.map((player) => player.total)).toEqual([-90, 20, 70]);
});

test("a typed winner value is saved, and dollars still use the opponents", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo", "Chitra"], 2);
  const saved = finishHand(
    id,
    seats,
    adminAuth,
    { Anu: 12, Bo: 20, Chitra: 80 },
    "Anu",
    session.version,
    -15,
  );

  expect(saved.games[0]?.scores[0]).toEqual({ playerId: seats[0]!.playerId, points: -15 });
  expect(saved.games[0]?.money).toBe(200);
  expect(saved.players.find((player) => player.id === seats[0]!.playerId)?.total).toBe(-15);
});

test("editing and deleting a game recompute the sheet", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo"]);
  const anu = seats[0]!.playerId;
  const bo = seats[1]!.playerId;
  const withFirst = finishHand(id, seats, adminAuth, { Anu: 0, Bo: 80 }, "Anu", session.version);
  const withSecond = finishHand(id, seats, adminAuth, { Anu: 40, Bo: 0 }, "Bo", withFirst.version);
  expect(withSecond.players.map((player) => player.total)).toEqual([-40, 40]);

  const second = withSecond.games[1];
  if (!second) throw new Error("Missing second game");
  const edited = updateGame(id, second.id, adminAuth, {
    version: withSecond.version,
    winnerPlayerId: bo,
    scores: [
      { playerId: anu, points: 66 },
      { playerId: bo, points: -50 },
    ],
  });
  expect(edited.games[1]?.scores).toEqual([
    { playerId: anu, points: 70 },
    { playerId: bo, points: -50 },
  ]);
  expect(edited.games[1]?.money).toBe(70);
  expect(edited.players.map((player) => player.total)).toEqual([-10, 30]);

  const deleted = deleteGame(id, second.id, adminAuth, edited.version);
  expect(deleted.games).toHaveLength(1);
  expect(deleted.players.map((player) => player.total)).toEqual([-80, 80]);
  expect(deleted.games[0]?.id).toBe(withFirst.games[0]?.id);
});

test("closing and reopening the database keeps each session", () => {
  const first = table(["Anu", "Bo"]);
  finishHand(first.id, first.seats, first.adminAuth, { Anu: 0, Bo: 20 }, "Anu", first.session.version);

  resetDb();
  const reloaded = getSession(first.id);
  expect(reloaded?.games).toHaveLength(1);
  expect(reloaded?.players.find((player) => player.name === "Bo")?.total).toBe(20);
  expect(reloaded?.pointValue).toBe(1);

  const second = createSession({ pointValue: 5, name: "Dev" });
  expect(getSession(first.id)?.games).toHaveLength(1);
  expect(getSession(second.session.id)?.players.map((player) => player.name)).toEqual(["Dev"]);
  expect(() =>
    viewSession(second.session.id, { seatCode: null, joinCode: first.joinCode }),
  ).toThrow(/not found/i);
});

test("stores ten cents per point and settles the game in dollars", () => {
  const created = table(["Anu", "Bo"], DEFAULT_POINT_VALUE);
  expect(created.session.pointValue).toBe(0.1);

  const saved = finishHand(
    created.id,
    created.seats,
    created.adminAuth,
    { Anu: 0, Bo: 20 },
    "Anu",
    created.session.version,
  );
  expect(saved.games[0]?.money).toBe(2);
  expect(getSession(created.id)?.pointValue).toBe(0.1);
});

test("an older rupee column is read as dollars per point", () => {
  const file = process.env.RUMMY_DB_PATH;
  if (!file) throw new Error("Missing database path");
  const db = new Database(file);
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      rupee_value REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE games (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      winner_player_id TEXT NOT NULL REFERENCES players(id),
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE game_scores (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      points REAL NOT NULL,
      PRIMARY KEY (game_id, player_id)
    );
  `);
  db.prepare(
    `INSERT INTO sessions (id, rupee_value, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run("old", 0.1, "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z");
  db.close();

  expect(getSession("old")?.pointValue).toBe(0.1);
});

test("the first phone starts with one name, and the table stops at 6", () => {
  const created = createSession({ pointValue: DEFAULT_POINT_VALUE, name: "Anu" });
  expect(created.session.players).toHaveLength(1);
  expect(created.session.role).toBe("admin");
  expect(created.session.pointValue).toBe(0.1);
  expect(created.session.rosterOpen).toBe(true);
  expect(JSON.stringify(created.session)).not.toContain(created.seatCode);

  expect(() => createSession({ pointValue: 0, name: "Anu" })).toThrow(/dollar/);
  expect(() => createSession({ pointValue: 1, name: "  " })).toThrow(/name/i);

  let version = created.session.version;
  const names = ["Bo", "Chitra", "Dev", "Ela", "Farid"];
  for (const name of names) {
    const added = addPlayer(
      created.session.id,
      { seatCode: null, joinCode: created.session.joinCode },
      { name, version },
    );
    version = added.session.version;
  }
  expect(
    viewSession(created.session.id, { seatCode: created.seatCode, joinCode: null }).players,
  ).toHaveLength(6);
  expect(() =>
    addPlayer(created.session.id, { seatCode: null, joinCode: created.session.joinCode }, {
      name: "Gita",
      version,
    }),
  ).toThrow(/6 players/);
});

test("a phone keeps its seat code, and another phone does not receive it", () => {
  const created = createSession({ pointValue: 1, name: "Anu" });
  const admin = viewSession(created.session.id, { seatCode: created.seatCode, joinCode: null });
  expect(admin.role).toBe("admin");
  expect(admin.playerId).toBe(created.session.playerId);

  const again = viewSessionByJoinCode(created.session.joinCode.toLowerCase(), {
    seatCode: created.seatCode,
    joinCode: null,
  });
  expect(again.role).toBe("admin");
  expect(again.playerId).toBe(created.session.playerId);

  const watcher = viewSessionByJoinCode(` ${created.session.joinCode} `, { seatCode: null, joinCode: null });
  expect(watcher.role).toBe("watch");
  expect(watcher.playerId).toBeNull();
  expect(JSON.stringify(watcher)).not.toContain(created.seatCode);
  expect(watcher.players.map((player) => player.name)).toEqual(["Anu"]);
  expect(watcher.pointValue).toBe(1);

  expect(() => viewSession(created.session.id, { seatCode: null, joinCode: null })).toThrow(/not found/i);
  expect(() => viewSessionByJoinCode("ZZZZZZ", { seatCode: null, joinCode: null })).toThrow(/doesn't match/);
  expect(() =>
    addPlayer(created.session.id, { seatCode: created.seatCode, joinCode: created.session.joinCode }, {
      name: "Bo",
      version: created.session.version,
    }),
  ).toThrow(/already has a seat/);

  const other = createSession({ pointValue: 1, name: "Other" });
  expect(() =>
    viewSession(other.session.id, { seatCode: null, joinCode: created.session.joinCode }),
  ).toThrow(/not found/i);
});

test("duplicate names are separate seats", () => {
  const { session } = table(["Anu", "Anu"]);
  expect(session.players.map((player) => player.name)).toEqual(["Anu", "Anu"]);
  expect(session.players[0]?.id).not.toBe(session.players[1]?.id);
});

test("a seat write changes only that seat, and a stale write is refused", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo", "Chitra"]);
  const anu = setSeatPoints(id, auth(seats[0]!.seatCode), { version: session.version, points: 20 });
  expect(anu.openHand.scores).toEqual([{ playerId: seats[0]!.playerId, points: 20 }]);

  expect(() =>
    setSeatPoints(id, auth(seats[1]!.seatCode), { version: session.version, points: 40 }),
  ).toThrow(/sheet changed/);

  const afterRefusal = viewSession(id, adminAuth);
  expect(afterRefusal.openHand.scores).toEqual([{ playerId: seats[0]!.playerId, points: 20 }]);

  const bo = setSeatPoints(id, auth(seats[1]!.seatCode), { version: anu.version, points: 66 });
  const admin = viewSession(id, adminAuth);
  expect(admin.version).toBe(bo.version);
  expect(admin.openHand.scores).toEqual([
    { playerId: seats[0]!.playerId, points: 20 },
    { playerId: seats[1]!.playerId, points: 66 },
  ]);

  const boView = viewSession(id, auth(seats[1]!.seatCode));
  expect(boView.role).toBe("seat");
  expect(boView.openHand.scores).toEqual([{ playerId: seats[1]!.playerId, points: 66 }]);
  expect(boView.openHand.winnerPlayerId).toBeNull();
  expect(boView.games).toEqual([]);
});

test("the hand is saved only when every other seat has a score and the admin set a winner", () => {
  const { id, seats, adminAuth, session, joinCode } = table(["Anu", "Bo"]);
  const anuOnly = setSeatPoints(id, auth(seats[0]!.seatCode), { version: session.version, points: 0 });
  const withWinner = setWinner(id, adminAuth, {
    version: anuOnly.version,
    winnerPlayerId: seats[0]!.playerId,
    winnerPoints: null,
  });
  expect(() => saveOpenHand(id, adminAuth, withWinner.version)).toThrow(/other player/i);

  expect(() =>
    setWinner(id, auth(seats[1]!.seatCode), {
      version: withWinner.version,
      winnerPlayerId: seats[1]!.playerId,
      winnerPoints: null,
    }),
  ).toThrow(/started the table/);
  expect(() => saveOpenHand(id, auth(seats[1]!.seatCode), withWinner.version)).toThrow(/started the table/);

  const watcher = viewSession(id, { seatCode: null, joinCode });
  expect(watcher.role).toBe("watch");
  expect(watcher.openHand.scores).toEqual([]);
  expect(watcher.players).toHaveLength(2);

  const bo = setSeatPoints(id, auth(seats[1]!.seatCode), { version: withWinner.version, points: 40 });
  const saved = saveOpenHand(id, adminAuth, bo.version);
  expect(saved.games).toHaveLength(1);
  expect(saved.openHand.scores).toEqual([]);
  expect(saved.rosterOpen).toBe(false);
  expect(() =>
    addPlayer(id, { seatCode: null, joinCode }, { name: "Chitra", version: saved.version }),
  ).toThrow(/locked/);

  const watching = viewSession(id, { seatCode: null, joinCode });
  expect(watching.games[0]?.money).toBe(40);
  expect(watching.players.map((player) => player.total)).toEqual([-40, 40]);
  expect(watching.openHand.scores).toEqual([]);
});

test("the winner does not enter points, including when the admin won", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo", "Chitra"]);
  const picked = setWinner(id, adminAuth, {
    version: session.version,
    winnerPlayerId: seats[0]!.playerId,
    winnerPoints: null,
  });
  const winnerPhone = viewSession(id, auth(seats[0]!.seatCode));
  expect(winnerPhone.role).toBe("admin");
  expect(winnerPhone.openHand.winnerPlayerId).toBe(seats[0]!.playerId);
  expect(winnerPhone.openHand.scores).toEqual([]);

  expect(() =>
    setSeatPoints(id, auth(seats[0]!.seatCode), { version: picked.version, points: 12 }),
  ).toThrow(/winner does not enter/i);
  expect(() => saveOpenHand(id, adminAuth, picked.version)).toThrow(/other player/i);

  const bo = setSeatPoints(id, auth(seats[1]!.seatCode), { version: picked.version, points: 20 });
  const chitra = setSeatPoints(id, auth(seats[2]!.seatCode), { version: bo.version, points: 66 });
  const saved = saveOpenHand(id, adminAuth, chitra.version);
  expect(saved.games[0]?.scores).toEqual([
    { playerId: seats[0]!.playerId, points: -90 },
    { playerId: seats[1]!.playerId, points: 20 },
    { playerId: seats[2]!.playerId, points: 70 },
  ]);
  expect(saved.games[0]?.money).toBe(90);
});

test("a winner who is not the admin is exempt, and an earlier score is not kept", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo"]);
  const anu = setSeatPoints(id, auth(seats[0]!.seatCode), { version: session.version, points: 15 });
  const bo = setSeatPoints(id, auth(seats[1]!.seatCode), { version: anu.version, points: 20 });
  const picked = setWinner(id, adminAuth, {
    version: bo.version,
    winnerPlayerId: seats[1]!.playerId,
    winnerPoints: null,
  });
  const boPhone = viewSession(id, auth(seats[1]!.seatCode));
  expect(boPhone.role).toBe("seat");
  expect(boPhone.openHand.winnerPlayerId).toBe(seats[1]!.playerId);
  expect(boPhone.openHand.scores).toEqual([]);
  expect(boPhone.openHand.winnerPoints).toBeNull();

  const saved = saveOpenHand(id, adminAuth, picked.version);
  expect(saved.games[0]?.scores).toEqual([
    { playerId: seats[0]!.playerId, points: 20 },
    { playerId: seats[1]!.playerId, points: -20 },
  ]);
  expect(saved.games[0]?.money).toBe(20);
});

test("scoring stays closed until two names exist", () => {
  const created = createSession({ pointValue: 1, name: "Anu" });
  expect(() =>
    setSeatPoints(created.session.id, auth(created.seatCode), {
      version: created.session.version,
      points: 20,
    }),
  ).toThrow(/second player/);
  expect(() =>
    saveOpenHand(created.session.id, auth(created.seatCode), created.session.version),
  ).toThrow(/second player/);
});

test("a stale edit is refused and the saved hand stays as it was", () => {
  const { id, seats, adminAuth, session } = table(["Anu", "Bo"]);
  const saved = finishHand(id, seats, adminAuth, { Anu: 0, Bo: 20 }, "Anu", session.version);
  const game = saved.games[0];
  if (!game) throw new Error("Missing game");

  const moved = setSeatPoints(id, auth(seats[0]!.seatCode), { version: saved.version, points: 10 });
  expect(() =>
    updateGame(id, game.id, adminAuth, {
      version: saved.version,
      winnerPlayerId: seats[1]!.playerId,
      scores: [
        { playerId: seats[0]!.playerId, points: 40 },
        { playerId: seats[1]!.playerId, points: -40 },
      ],
    }),
  ).toThrow(/sheet changed/);

  const current = viewSession(id, adminAuth);
  expect(current.version).toBe(moved.version);
  expect(current.games[0]?.winnerPlayerId).toBe(seats[0]!.playerId);
  expect(current.games[0]?.scores[1]?.points).toBe(20);
  expect(() => deleteGame(id, game.id, auth(seats[1]!.seatCode), current.version)).toThrow(
    /started the table/,
  );
});

test("the stake stays at the value from create", () => {
  const created = table(["Anu", "Bo"], 0.25);
  const saved = finishHand(
    created.id,
    created.seats,
    created.adminAuth,
    { Anu: 0, Bo: 20 },
    "Anu",
    created.session.version,
  );
  expect(saved.pointValue).toBe(0.25);
  expect(saved.games[0]?.money).toBe(5);
});
