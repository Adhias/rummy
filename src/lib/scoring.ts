import type { GameScore, ScoreInput } from "@/lib/types";

export const PACK_POINTS = 20;
export const DOUBLE_PACK_POINTS = 40;
export const FULL_COUNT_POINTS = 80;
export const LOSER_CAP = 80;
export const DEFAULT_POINT_VALUE = 0.1;

export const CARD_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "Joker",
] as const;

export type CardRank = (typeof CARD_RANKS)[number];

const FACE_RANKS = new Set(["A", "J", "Q", "K"]);

export function roundLoserPoints(raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new Error("Enter a score for every player");
  }
  if (raw < 0) {
    throw new Error("A loser's score has to be 0 or more");
  }
  const nearestTen = Math.round(raw / 10) * 10;
  return Math.min(LOSER_CAP, nearestTen);
}

export function suggestWinnerPoints(rawLoserPoints: number[]): number {
  return -rawLoserPoints.reduce((sum, points) => sum + roundLoserPoints(points), 0);
}

export function storeGameScores(
  playerIds: string[],
  winnerPlayerId: string,
  scores: ScoreInput[],
): GameScore[] {
  if (!playerIds.includes(winnerPlayerId)) {
    throw new Error("Pick a winner from this session");
  }

  const byPlayer = new Map<string, number>();
  for (const score of scores) {
    if (!playerIds.includes(score.playerId)) {
      throw new Error("Unknown player on this game");
    }
    if (byPlayer.has(score.playerId)) {
      throw new Error("Each player needs one score");
    }
    if (!Number.isFinite(score.points)) {
      throw new Error("Enter a score for every player");
    }
    byPlayer.set(score.playerId, score.points);
  }

  if (byPlayer.size !== playerIds.length) {
    throw new Error("Enter a score for every player");
  }

  return playerIds.map((playerId) => {
    const raw = byPlayer.get(playerId)!;
    if (playerId === winnerPlayerId) {
      return { playerId, points: raw };
    }
    return { playerId, points: roundLoserPoints(raw) };
  });
}

export function opponentPoints(scores: GameScore[], winnerPlayerId: string): number[] {
  return scores
    .filter((score) => score.playerId !== winnerPlayerId)
    .map((score) => score.points);
}

export function gameMoney(points: number[], pointValue: number): number {
  const raw = points.reduce((sum, value) => sum + value, 0) * pointValue;
  return Math.round(raw * 100) / 100;
}

export function runningTotals(
  playerIds: string[],
  games: { scores: GameScore[] }[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const playerId of playerIds) totals[playerId] = 0;
  for (const game of games) {
    for (const score of game.scores) {
      totals[score.playerId] = (totals[score.playerId] ?? 0) + score.points;
    }
  }
  return totals;
}

export function cardPoints(rank: string): number {
  if (rank === "Joker") return 0;
  if (FACE_RANKS.has(rank)) return 10;
  const value = Number(rank);
  if (Number.isInteger(value) && value >= 2 && value <= 10) return value;
  throw new Error(`Unknown card ${rank}`);
}

export function countHand(ranks: readonly string[]): number {
  return ranks.reduce((sum, rank) => sum + cardPoints(rank), 0);
}

export function parsePoints(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function formatPoints(points: number): string {
  const text = Number.isInteger(points) ? String(points) : String(points);
  return text.replace("-", "−");
}

export function formatDollars(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function aheadPlayerIds(
  players: { id: string; total: number }[],
  gameCount: number,
): string[] {
  if (gameCount === 0 || players.length === 0) return [];
  const lowest = Math.min(...players.map((player) => player.total));
  return players.filter((player) => player.total === lowest).map((player) => player.id);
}
