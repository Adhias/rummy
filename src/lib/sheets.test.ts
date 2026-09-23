import { afterEach, expect, test } from "vitest";
import { finishedHandRow, recordSavedHand, setSheetWriter } from "@/lib/sheets";
import type { SessionView } from "@/lib/types";

afterEach(() => {
  setSheetWriter(null);
});

function savedSession(): SessionView {
  return {
    id: "s",
    pointValue: 0.1,
    createdAt: "",
    updatedAt: "",
    version: 4,
    joinCode: "ABCDEF",
    role: "admin",
    playerId: "cara",
    rosterOpen: false,
    players: [
      { id: "cara", name: "Cara", position: 0, total: 40 },
      { id: "anu", name: "Anu", position: 1, total: -40 },
    ],
    games: [
      {
        id: "g",
        position: 1,
        winnerPlayerId: "anu",
        createdAt: "",
        scores: [
          { playerId: "cara", points: 40 },
          { playerId: "anu", points: -40 },
        ],
        money: 4,
      },
    ],
    openHand: { scores: [], winnerPlayerId: null, winnerPoints: null, winnerOverridden: false },
  };
}

test("a finished hand is one row in seat order, then the winner and the dollars", () => {
  expect(finishedHandRow(savedSession())).toEqual([40, -40, "Anu", 4]);
});

test("missing Google credentials skip the remote write", async () => {
  const spreadsheet = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const calls: number[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls.push(1);
    throw new Error("network");
  }) as typeof fetch;
  try {
    await recordSavedHand(savedSession());
    expect(calls).toEqual([]);
  } finally {
    globalThis.fetch = original;
    if (spreadsheet === undefined) delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    else process.env.GOOGLE_SHEETS_SPREADSHEET_ID = spreadsheet;
    if (credentials === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = credentials;
  }
});
