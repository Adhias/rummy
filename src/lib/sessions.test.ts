import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { resetDb } from "@/lib/db";
import {
  addGame,
  createSession,
  deleteGame,
  getSession,
  listSessions,
  renamePlayer,
  updateGame,
} from "@/lib/sessions";

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "rummy-"));
  process.env.RUMMY_DB_PATH = path.join(dir, "rummy.sqlite");
  resetDb();
});

afterEach(() => {
  resetDb();
});

function playerId(name: string, sessionId: string) {
  const session = getSession(sessionId);
  const player = session?.players.find((item) => item.name === name);
  if (!player) throw new Error(`Missing ${name}`);
  return player.id;
}

test("a pack and an 80-point hand update totals, and 66 is stored as 70", () => {
  const created = createSession({
    rupeeValue: 1,
    players: ["Anu", "Bo", "Chitra"],
  });
  const anu = playerId("Anu", created.id);
  const bo = playerId("Bo", created.id);
  const chitra = playerId("Chitra", created.id);

  const session = addGame(created.id, {
    winnerPlayerId: anu,
    scores: [
      { playerId: anu, points: -90 },
      { playerId: bo, points: 20 },
      { playerId: chitra, points: 66 },
    ],
  });

  const game = session.games[0];
  expect(game.scores).toEqual([
    { playerId: anu, points: -90 },
    { playerId: bo, points: 20 },
    { playerId: chitra, points: 70 },
  ]);
  expect(game.money).toBe(90);
  expect(session.players.map((player) => player.total)).toEqual([-90, 20, 70]);
});

test("a typed winner value is saved, and rupees still use the opponents", () => {
  const created = createSession({ rupeeValue: 2, players: ["Anu", "Bo", "Chitra"] });
  const anu = playerId("Anu", created.id);
  const bo = playerId("Bo", created.id);
  const chitra = playerId("Chitra", created.id);

  const session = addGame(created.id, {
    winnerPlayerId: anu,
    scores: [
      { playerId: anu, points: -15 },
      { playerId: bo, points: 20 },
      { playerId: chitra, points: 80 },
    ],
  });

  expect(session.games[0].scores[0]).toEqual({ playerId: anu, points: -15 });
  expect(session.games[0].money).toBe(200);
  expect(session.players.find((player) => player.id === anu)?.total).toBe(-15);
});

test("editing and deleting a game recompute the sheet", () => {
  const created = createSession({ rupeeValue: 1, players: ["Anu", "Bo"] });
  const anu = playerId("Anu", created.id);
  const bo = playerId("Bo", created.id);

  const withFirst = addGame(created.id, {
    winnerPlayerId: anu,
    scores: [
      { playerId: anu, points: -80 },
      { playerId: bo, points: 80 },
    ],
  });
  const withSecond = addGame(created.id, {
    winnerPlayerId: bo,
    scores: [
      { playerId: anu, points: 40 },
      { playerId: bo, points: -40 },
    ],
  });
  expect(withSecond.players.map((player) => player.total)).toEqual([-40, 40]);

  const second = withSecond.games[1];
  const edited = updateGame(created.id, second.id, {
    winnerPlayerId: bo,
    scores: [
      { playerId: anu, points: 66 },
      { playerId: bo, points: -50 },
    ],
  });
  expect(edited.games[1].scores).toEqual([
    { playerId: anu, points: 70 },
    { playerId: bo, points: -50 },
  ]);
  expect(edited.games[1].money).toBe(70);
  expect(edited.players.map((player) => player.total)).toEqual([-10, 30]);

  const deleted = deleteGame(created.id, second.id);
  expect(deleted.games).toHaveLength(1);
  expect(deleted.players.map((player) => player.total)).toEqual([-80, 80]);
  expect(deleted.games[0].id).toBe(withFirst.games[0].id);
});

test("closing and reopening the database keeps the session, and older sessions stay listed", () => {
  const first = createSession({ rupeeValue: 1, players: ["Anu", "Bo"] });
  const anu = playerId("Anu", first.id);
  const bo = playerId("Bo", first.id);
  addGame(first.id, {
    winnerPlayerId: anu,
    scores: [
      { playerId: anu, points: -20 },
      { playerId: bo, points: 20 },
    ],
  });

  resetDb();
  const reloaded = getSession(first.id);
  expect(reloaded?.games).toHaveLength(1);
  expect(reloaded?.players.find((player) => player.name === "Bo")?.total).toBe(20);

  const second = createSession({ rupeeValue: 5, players: ["Dev", "Ela"] });
  const listed = listSessions();
  expect(listed.map((session) => session.id)).toEqual([second.id, first.id]);
  expect(getSession(first.id)?.games).toHaveLength(1);

  const renamed = renamePlayer(first.id, anu, "Anusha");
  expect(renamed.players[0].name).toBe("Anusha");
  expect(renamed.players[0].total).toBe(-20);
});

test("rejects a session that is outside 2 to 6 named players", () => {
  expect(() => createSession({ rupeeValue: 1, players: ["Anu"] })).toThrow(/2 to 6/);
  expect(() =>
    createSession({
      rupeeValue: 1,
      players: ["A", "B", "C", "D", "E", "F", "G"],
    }),
  ).toThrow(/2 to 6/);
  expect(() => createSession({ rupeeValue: 0, players: ["Anu", "Bo"] })).toThrow(/rupee/);
  expect(() => createSession({ rupeeValue: 1, players: ["Anu", "  "] })).toThrow(/name/i);
});
