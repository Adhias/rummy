import { describe, expect, test } from "vitest";
import {
  cardPoints,
  countHand,
  formatDollars,
  gameMoney,
  opponentPoints,
  roundLoserPoints,
  runningTotals,
  storeGameScores,
  suggestWinnerPoints,
} from "@/lib/scoring";

describe("roundLoserPoints", () => {
  test("rounds to the nearest 10, with 5 rounding up", () => {
    expect(roundLoserPoints(64)).toBe(60);
    expect(roundLoserPoints(66)).toBe(70);
    expect(roundLoserPoints(65)).toBe(70);
    expect(roundLoserPoints(75)).toBe(80);
    expect(roundLoserPoints(4)).toBe(0);
    expect(roundLoserPoints(5)).toBe(10);
    expect(roundLoserPoints(25)).toBe(30);
  });

  test("leaves pack, double pack, and a full count unchanged", () => {
    expect(roundLoserPoints(20)).toBe(20);
    expect(roundLoserPoints(40)).toBe(40);
    expect(roundLoserPoints(80)).toBe(80);
    expect(roundLoserPoints(0)).toBe(0);
  });

  test("caps a loser at 80 after rounding", () => {
    expect(roundLoserPoints(81)).toBe(80);
    expect(roundLoserPoints(85)).toBe(80);
    expect(roundLoserPoints(96)).toBe(80);
    expect(roundLoserPoints(79)).toBe(80);
  });

  test("rejects a negative loser score", () => {
    expect(() => roundLoserPoints(-1)).toThrow(/0 or more/);
  });
});

describe("winner points and money", () => {
  const players = ["anu", "bo", "chitra"];

  test("suggests the negative of the rounded loser scores", () => {
    expect(suggestWinnerPoints([20, 80])).toBe(-100);
    expect(suggestWinnerPoints([66, 20])).toBe(-90);
    expect(suggestWinnerPoints([75])).toBe(-80);
  });

  test("stores a typed winner value without rounding it", () => {
    const stored = storeGameScores(players, "anu", [
      { playerId: "anu", points: -40 },
      { playerId: "bo", points: 66 },
      { playerId: "chitra", points: 80 },
    ]);
    expect(stored).toEqual([
      { playerId: "anu", points: -40 },
      { playerId: "bo", points: 70 },
      { playerId: "chitra", points: 80 },
    ]);
  });

  test("fills the winner with the negative sum when that value is submitted", () => {
    const stored = storeGameScores(players, "anu", [
      { playerId: "anu", points: suggestWinnerPoints([20, 80]) },
      { playerId: "bo", points: 20 },
      { playerId: "chitra", points: 80 },
    ]);
    expect(stored[0]).toEqual({ playerId: "anu", points: -100 });
  });

  test("computes dollars from stored opponent points, not the winner field", () => {
    const stored = storeGameScores(players, "anu", [
      { playerId: "anu", points: -5 },
      { playerId: "bo", points: 20 },
      { playerId: "chitra", points: 66 },
    ]);
    const opponents = opponentPoints(stored, "anu");
    expect(opponents).toEqual([20, 70]);
    expect(gameMoney(opponents, 1)).toBe(90);
    expect(gameMoney(opponents, 2)).toBe(180);
    expect(gameMoney(opponents, 0.5)).toBe(45);
    expect(gameMoney(opponents, 0.1)).toBe(9);
    expect(formatDollars(0.1)).toBe("$0.10");
    expect(formatDollars(9)).toBe("$9.00");
  });
});

describe("running totals", () => {
  test("adds every game, and edit or delete is just a new list", () => {
    const playerIds = ["anu", "bo"];
    const first = {
      scores: [
        { playerId: "anu", points: -20 },
        { playerId: "bo", points: 20 },
      ],
    };
    const second = {
      scores: [
        { playerId: "anu", points: 70 },
        { playerId: "bo", points: -70 },
      ],
    };
    expect(runningTotals(playerIds, [first, second])).toEqual({ anu: 50, bo: -50 });

    const editedSecond = {
      scores: [
        { playerId: "anu", points: 40 },
        { playerId: "bo", points: -40 },
      ],
    };
    expect(runningTotals(playerIds, [first, editedSecond])).toEqual({ anu: 20, bo: -20 });
    expect(runningTotals(playerIds, [first])).toEqual({ anu: -20, bo: 20 });
  });
});

describe("card counter", () => {
  test("counts face value, court cards, aces, and jokers", () => {
    expect(cardPoints("7")).toBe(7);
    expect(cardPoints("10")).toBe(10);
    expect(cardPoints("A")).toBe(10);
    expect(cardPoints("J")).toBe(10);
    expect(cardPoints("Q")).toBe(10);
    expect(cardPoints("K")).toBe(10);
    expect(cardPoints("Joker")).toBe(0);
    expect(countHand(["A", "K", "7", "Joker", "2"])).toBe(29);
  });
});
