import { expect, test } from "vitest";
import { forget, parseMemory, remember } from "@/components/device-memory";
import type { SessionView } from "@/lib/types";

function view(id: string, names: string[], joinCode = "AB12CD"): SessionView {
  return {
    id,
    pointValue: 0.1,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    version: 1,
    joinCode,
    role: "admin",
    playerId: "p1",
    players: names.map((name, position) => ({ id: `p${position}`, name, position, total: 0 })),
    games: [],
    openHand: { scores: [], winnerPlayerId: null, winnerPoints: null, winnerOverridden: false },
    rosterOpen: true,
  };
}

test("a phone remembers its seat and a later refresh does not drop the code", () => {
  const first = remember(
    { activeSessionId: null, sessions: [] },
    view("s1", ["Anu"]),
    "seat-anu",
  );
  const refreshed = remember(first, view("s1", ["Anu", "Bo"]), null);
  expect(refreshed.sessions[0]?.seatCode).toBe("seat-anu");
  expect(refreshed.sessions[0]?.label).toBe("Anu, Bo");
  expect(refreshed.activeSessionId).toBe("s1");

  const second = remember(refreshed, view("s2", ["Dev"], "CD34EF"), "seat-dev");
  expect(second.sessions.map((item) => item.sessionId)).toEqual(["s2", "s1"]);
  expect(second.sessions.find((item) => item.sessionId === "s1")?.seatCode).toBe("seat-anu");
});

test("corrupt phone memory is ignored", () => {
  expect(parseMemory("not json").sessions).toEqual([]);
  expect(parseMemory(JSON.stringify({ sessions: [{ sessionId: 1 }] })).sessions).toEqual([]);
  const parsed = parseMemory(
    JSON.stringify({
      activeSessionId: "s1",
      sessions: [{ sessionId: "s1", joinCode: "AB12CD", seatCode: "seat", label: "Anu" }],
    }),
  );
  expect(parsed.activeSessionId).toBe("s1");
  expect(parsed.sessions[0]?.seatCode).toBe("seat");
});

test("forgetting a sheet leaves the other phone sessions", () => {
  const memory = remember(
    remember({ activeSessionId: null, sessions: [] }, view("s1", ["Anu"]), "a"),
    view("s2", ["Bo"], "CD34EF"),
    "b",
  );
  const left = forget(memory, "s2");
  expect(left.activeSessionId).toBe("s1");
  expect(left.sessions.map((item) => item.sessionId)).toEqual(["s1"]);
});
