import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import {
  gameMoney,
  opponentPoints,
  runningTotals,
  storeGameScores,
} from "@/lib/scoring";
import type { Game, GameInput, Player, SessionDetail, SessionSummary } from "@/lib/types";

type SessionRow = {
  id: string;
  point_value: number;
  created_at: string;
  updated_at: string;
};

type PlayerRow = {
  id: string;
  name: string;
  position: number;
};

type GameRow = {
  id: string;
  position: number;
  winner_player_id: string;
  created_at: string;
};

type ScoreRow = {
  game_id: string;
  player_id: string;
  points: number;
};

function readPointValue(value: unknown): number {
  const pointValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(pointValue) || pointValue <= 0 || pointValue > 1_000_000) {
    throw new AppError("Set a dollar value greater than zero");
  }
  return pointValue;
}

function readNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new AppError("A session needs 2 to 6 players");
  }
  return value.map((name) => {
    if (typeof name !== "string") throw new AppError("Enter a name for every player");
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 24) {
      throw new AppError("Each name needs 1 to 24 characters");
    }
    return trimmed;
  });
}

function touch(sessionId: string) {
  getDb()
    .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), sessionId);
}

function loadPlayers(sessionId: string): PlayerRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, position FROM players WHERE session_id = ? ORDER BY position ASC`,
    )
    .all(sessionId) as PlayerRow[];
}

export function getSession(id: string): SessionDetail | null {
  const db = getDb();
  const session = db
    .prepare(`SELECT id, point_value, created_at, updated_at FROM sessions WHERE id = ?`)
    .get(id) as SessionRow | undefined;
  if (!session) return null;

  const playerRows = loadPlayers(id);
  const gameRows = db
    .prepare(
      `SELECT id, position, winner_player_id, created_at
       FROM games WHERE session_id = ? ORDER BY position ASC`,
    )
    .all(id) as GameRow[];

  const scoreRows = gameRows.length
    ? (db
        .prepare(
          `SELECT game_id, player_id, points FROM game_scores
           WHERE game_id IN (${gameRows.map(() => "?").join(",")})`,
        )
        .all(...gameRows.map((game) => game.id)) as ScoreRow[])
    : [];

  const scoresByGame = new Map<string, ScoreRow[]>();
  for (const score of scoreRows) {
    const list = scoresByGame.get(score.game_id) ?? [];
    list.push(score);
    scoresByGame.set(score.game_id, list);
  }

  const games: Game[] = gameRows.map((game) => {
    const scores = (scoresByGame.get(game.id) ?? [])
      .map((score) => ({ playerId: score.player_id, points: score.points }))
      .sort((a, b) => {
        const aIndex = playerRows.findIndex((player) => player.id === a.playerId);
        const bIndex = playerRows.findIndex((player) => player.id === b.playerId);
        return aIndex - bIndex;
      });
    return {
      id: game.id,
      position: game.position,
      winnerPlayerId: game.winner_player_id,
      createdAt: game.created_at,
      scores,
      money: gameMoney(opponentPoints(scores, game.winner_player_id), session.point_value),
    };
  });

  const totals = runningTotals(
    playerRows.map((player) => player.id),
    games,
  );

  const players: Player[] = playerRows.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    total: totals[player.id] ?? 0,
  }));

  return {
    id: session.id,
    pointValue: session.point_value,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    players,
    games,
  };
}

export function listSessions(): SessionSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id FROM sessions ORDER BY updated_at DESC`,
    )
    .all() as { id: string }[];

  return rows.flatMap((row) => {
    const session = getSession(row.id);
    if (!session) return [];
    return [
      {
        id: session.id,
        pointValue: session.pointValue,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        gameCount: session.games.length,
        players: session.players.map((player) => ({
          id: player.id,
          name: player.name,
          total: player.total,
        })),
      },
    ];
  });
}

export function createSession(input: { pointValue: unknown; players: unknown }): SessionDetail {
  const names = readNames(input.players);
  const pointValue = readPointValue(input.pointValue);
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, point_value, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(id, pointValue, now, now);
    const insertPlayer = db.prepare(
      `INSERT INTO players (id, session_id, name, position) VALUES (?, ?, ?, ?)`,
    );
    names.forEach((name, position) => {
      insertPlayer.run(crypto.randomUUID(), id, name, position);
    });
  });
  insert();

  const session = getSession(id);
  if (!session) throw new AppError("Could not start the session", 500);
  return session;
}

export function renamePlayer(sessionId: string, playerId: string, name: unknown): SessionDetail {
  if (typeof name !== "string") throw new AppError("Enter a name");
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 24) {
    throw new AppError("Each name needs 1 to 24 characters");
  }
  const result = getDb()
    .prepare(`UPDATE players SET name = ? WHERE id = ? AND session_id = ?`)
    .run(trimmed, playerId, sessionId);
  if (result.changes === 0) throw new AppError("Player not found", 404);
  touch(sessionId);
  const session = getSession(sessionId);
  if (!session) throw new AppError("Session not found", 404);
  return session;
}

function requireSessionPlayers(sessionId: string): PlayerRow[] {
  const session = getDb()
    .prepare(`SELECT id FROM sessions WHERE id = ?`)
    .get(sessionId) as { id: string } | undefined;
  if (!session) throw new AppError("Session not found", 404);
  return loadPlayers(sessionId);
}

function writeScores(gameId: string, scores: { playerId: string; points: number }[]) {
  const db = getDb();
  db.prepare(`DELETE FROM game_scores WHERE game_id = ?`).run(gameId);
  const insert = db.prepare(
    `INSERT INTO game_scores (game_id, player_id, points) VALUES (?, ?, ?)`,
  );
  for (const score of scores) {
    insert.run(gameId, score.playerId, score.points);
  }
}

function readGameInput(players: PlayerRow[], input: GameInput) {
  try {
    return storeGameScores(
      players.map((player) => player.id),
      input.winnerPlayerId,
      input.scores,
    );
  } catch (error) {
    if (error instanceof Error) throw new AppError(error.message);
    throw error;
  }
}

export function addGame(sessionId: string, input: GameInput): SessionDetail {
  const players = requireSessionPlayers(sessionId);
  const scores = readGameInput(players, input);
  const db = getDb();
  const gameId = crypto.randomUUID();
  const now = new Date().toISOString();
  const position = (
    db
      .prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM games WHERE session_id = ?`)
      .get(sessionId) as { next: number }
  ).next;

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO games (id, session_id, winner_player_id, position, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(gameId, sessionId, input.winnerPlayerId, position, now);
    writeScores(gameId, scores);
    touch(sessionId);
  });
  insert();

  const session = getSession(sessionId);
  if (!session) throw new AppError("Session not found", 404);
  return session;
}

export function updateGame(sessionId: string, gameId: string, input: GameInput): SessionDetail {
  const players = requireSessionPlayers(sessionId);
  const scores = readGameInput(players, input);
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM games WHERE id = ? AND session_id = ?`)
    .get(gameId, sessionId) as { id: string } | undefined;
  if (!existing) throw new AppError("Game not found", 404);

  const update = db.transaction(() => {
    db.prepare(`UPDATE games SET winner_player_id = ? WHERE id = ?`).run(
      input.winnerPlayerId,
      gameId,
    );
    writeScores(gameId, scores);
    touch(sessionId);
  });
  update();

  const session = getSession(sessionId);
  if (!session) throw new AppError("Session not found", 404);
  return session;
}

export function deleteGame(sessionId: string, gameId: string): SessionDetail {
  requireSessionPlayers(sessionId);
  const result = getDb()
    .prepare(`DELETE FROM games WHERE id = ? AND session_id = ?`)
    .run(gameId, sessionId);
  if (result.changes === 0) throw new AppError("Game not found", 404);
  touch(sessionId);
  const session = getSession(sessionId);
  if (!session) throw new AppError("Session not found", 404);
  return session;
}
