import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/db";
import {
  gameMoney,
  opponentPoints,
  runningTotals,
  storeGameScores,
  suggestWinnerPoints,
} from "@/lib/scoring";
import type {
  DeviceAuth,
  Game,
  GameInput,
  OpenHand,
  PhoneRole,
  Player,
  SeatClaim,
  SessionDetail,
  SessionView,
} from "@/lib/types";

const JOIN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

type SessionRow = {
  id: string;
  point_value: number;
  created_at: string;
  updated_at: string;
  version: number;
  join_code: string | null;
  admin_player_id: string | null;
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

type OpenHandRow = {
  winner_player_id: string | null;
  winner_points: number | null;
  winner_overridden: number;
};

function readPointValue(value: unknown): number {
  const pointValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(pointValue) || pointValue <= 0 || pointValue > 1_000_000) {
    throw new AppError("Set a dollar value greater than zero");
  }
  return pointValue;
}

function readName(value: unknown): string {
  if (typeof value !== "string") throw new AppError("Enter a name");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 24) {
    throw new AppError("Each name needs 1 to 24 characters");
  }
  return trimmed;
}

function readVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AppError("Reload the sheet and try again");
  }
  return value;
}

function readSeatPoints(value: unknown): number {
  const points = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(points) || points < 0) {
    throw new AppError("Enter a score of 0 or more");
  }
  return points;
}

function readWinnerPoints(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const points = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(points)) throw new AppError("Enter the winner's points");
  return points;
}

export function normalizeJoinCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)) return null;
  return code;
}

function randomJoinCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += JOIN_ALPHABET[byte % JOIN_ALPHABET.length];
  return code;
}

function unusedJoinCode(): string {
  const db = getDb();
  const taken = db.prepare(`SELECT 1 FROM sessions WHERE join_code = ?`);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomJoinCode();
    if (!taken.get(code)) return code;
  }
  throw new AppError("Could not start the session", 500);
}

function bump(sessionId: string, version: number) {
  const result = getDb()
    .prepare(
      `UPDATE sessions SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
    )
    .run(new Date().toISOString(), sessionId, version);
  if (result.changes === 1) return;
  const exists = getDb().prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId);
  if (!exists) throw new AppError("Session not found", 404);
  throw new AppError("The sheet changed. Reload it and try again.", 409);
}

function loadPlayers(sessionId: string): PlayerRow[] {
  return getDb()
    .prepare(
      `SELECT id, name, position FROM players WHERE session_id = ? ORDER BY position ASC`,
    )
    .all(sessionId) as PlayerRow[];
}

function loadOpenHand(sessionId: string): OpenHand {
  const db = getDb();
  const hand = db
    .prepare(
      `SELECT winner_player_id, winner_points, winner_overridden FROM open_hands WHERE session_id = ?`,
    )
    .get(sessionId) as OpenHandRow | undefined;
  const scores = db
    .prepare(
      `SELECT s.player_id, s.points
       FROM open_hand_scores s
       JOIN players p ON p.id = s.player_id
       WHERE s.session_id = ?
       ORDER BY p.position ASC`,
    )
    .all(sessionId) as { player_id: string; points: number }[];
  return {
    scores: scores.map((score) => ({ playerId: score.player_id, points: score.points })),
    winnerPlayerId: hand?.winner_player_id ?? null,
    winnerPoints: hand?.winner_points ?? null,
    winnerOverridden: Boolean(hand?.winner_overridden),
  };
}

function findSeat(sessionId: string, seatCode: string | null): { id: string } | null {
  if (!seatCode) return null;
  const row = getDb()
    .prepare(`SELECT id FROM players WHERE session_id = ? AND seat_code = ?`)
    .get(sessionId, seatCode) as { id: string } | undefined;
  return row ?? null;
}

function joinMatches(session: SessionDetail, auth: DeviceAuth): boolean {
  const code = normalizeJoinCode(auth.joinCode);
  return Boolean(code && session.joinCode && code === session.joinCode);
}

function visibleOpenHand(role: PhoneRole, playerId: string | null, openHand: OpenHand): OpenHand {
  if (role === "admin") return openHand;
  if (role === "seat" && playerId) {
    return {
      scores: openHand.scores.filter((score) => score.playerId === playerId),
      winnerPlayerId: null,
      winnerPoints: null,
      winnerOverridden: false,
    };
  }
  return {
    scores: [],
    winnerPlayerId: null,
    winnerPoints: null,
    winnerOverridden: false,
  };
}

function present(session: SessionDetail, auth: DeviceAuth): SessionView {
  if (!session.joinCode) throw new AppError("Session not found", 404);
  const seat = findSeat(session.id, auth.seatCode);
  if (!seat && !joinMatches(session, auth)) throw new AppError("Session not found", 404);
  const role: PhoneRole = seat ? (seat.id === session.adminPlayerId ? "admin" : "seat") : "watch";
  const playerId = seat?.id ?? null;
  return {
    id: session.id,
    pointValue: session.pointValue,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    version: session.version,
    joinCode: session.joinCode,
    role,
    playerId,
    players: session.players,
    games: session.games,
    openHand: visibleOpenHand(role, playerId, session.openHand),
    rosterOpen: session.games.length === 0 && session.players.length < 6,
  };
}

function mustGet(id: string): SessionDetail {
  const session = getSession(id);
  if (!session) throw new AppError("Session not found", 404);
  return session;
}

function requireMember(session: SessionDetail, auth: DeviceAuth): { id: string } | null {
  const seat = findSeat(session.id, auth.seatCode);
  if (!seat && !joinMatches(session, auth)) throw new AppError("Session not found", 404);
  return seat;
}

function requireAdmin(session: SessionDetail, auth: DeviceAuth) {
  const seat = requireMember(session, auth);
  if (!seat || seat.id !== session.adminPlayerId) {
    throw new AppError("Only the phone that started the table can do that", 403);
  }
}

function requireSeat(session: SessionDetail, auth: DeviceAuth): { id: string } {
  const seat = requireMember(session, auth);
  if (!seat) throw new AppError("Add your name before entering points", 403);
  return seat;
}

export function getSession(id: string): SessionDetail | null {
  const db = getDb();
  const session = db
    .prepare(
      `SELECT id, point_value, created_at, updated_at, version, join_code, admin_player_id
       FROM sessions WHERE id = ?`,
    )
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
    version: session.version,
    joinCode: session.join_code,
    adminPlayerId: session.admin_player_id,
    players,
    games,
    openHand: loadOpenHand(id),
  };
}

export function viewSession(id: string, auth: DeviceAuth): SessionView {
  return present(mustGet(id), auth);
}

export function viewSessionByJoinCode(code: string, auth: DeviceAuth): SessionView {
  const normalized = normalizeJoinCode(code);
  if (!normalized) throw new AppError("That code doesn't match a table", 404);
  const row = getDb()
    .prepare(`SELECT id FROM sessions WHERE join_code = ?`)
    .get(normalized) as { id: string } | undefined;
  if (!row) throw new AppError("That code doesn't match a table", 404);
  return present(mustGet(row.id), { seatCode: auth.seatCode, joinCode: normalized });
}

export function createSession(input: { pointValue: unknown; name: unknown }): SeatClaim {
  const name = readName(input.name);
  const pointValue = readPointValue(input.pointValue);
  const db = getDb();
  const sessionId = crypto.randomUUID();
  const playerId = crypto.randomUUID();
  const seatCode = crypto.randomUUID();
  const joinCode = unusedJoinCode();
  const now = new Date().toISOString();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, point_value, created_at, updated_at, version, join_code, admin_player_id)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    ).run(sessionId, pointValue, now, now, joinCode, playerId);
    db.prepare(
      `INSERT INTO players (id, session_id, name, position, seat_code) VALUES (?, ?, ?, 0, ?)`,
    ).run(playerId, sessionId, name, seatCode);
  });
  insert();

  return {
    session: present(mustGet(sessionId), { seatCode, joinCode }),
    seatCode,
  };
}

export function addPlayer(
  sessionId: string,
  auth: DeviceAuth,
  input: { name: unknown; version: unknown },
): SeatClaim {
  const session = mustGet(sessionId);
  if (!joinMatches(session, auth)) throw new AppError("Session not found", 404);
  if (findSeat(sessionId, auth.seatCode)) throw new AppError("This phone already has a seat");
  const name = readName(input.name);
  const version = readVersion(input.version);
  const seatCode = crypto.randomUUID();
  const playerId = crypto.randomUUID();
  const db = getDb();

  const insert = db.transaction(() => {
    bump(sessionId, version);
    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM players WHERE session_id = ?) AS players,
           (SELECT COUNT(*) FROM games WHERE session_id = ?) AS games`,
      )
      .get(sessionId, sessionId) as { players: number; games: number };
    if (counts.games > 0) throw new AppError("Names are locked once a hand is saved");
    if (counts.players >= 6) throw new AppError("This table has 6 players");
    const position = (
      db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM players WHERE session_id = ?`,
        )
        .get(sessionId) as { next: number }
    ).next;
    db.prepare(
      `INSERT INTO players (id, session_id, name, position, seat_code) VALUES (?, ?, ?, ?, ?)`,
    ).run(playerId, sessionId, name, position, seatCode);
  });
  insert();

  return {
    session: present(mustGet(sessionId), { seatCode, joinCode: session.joinCode }),
    seatCode,
  };
}

export function setSeatPoints(
  sessionId: string,
  auth: DeviceAuth,
  input: { version: unknown; points: unknown },
): SessionView {
  const session = mustGet(sessionId);
  const seat = requireSeat(session, auth);
  if (session.players.length < 2) {
    throw new AppError("Scoring opens when a second player joins");
  }
  const version = readVersion(input.version);
  const points = readSeatPoints(input.points);
  const db = getDb();

  const write = db.transaction(() => {
    bump(sessionId, version);
    db.prepare(
      `INSERT INTO open_hand_scores (session_id, player_id, points) VALUES (?, ?, ?)
       ON CONFLICT(session_id, player_id) DO UPDATE SET points = excluded.points`,
    ).run(sessionId, seat.id, points);
  });
  write();

  return present(mustGet(sessionId), auth);
}

function storeWinner(
  sessionId: string,
  winnerPlayerId: string,
  winnerPoints: number | null,
) {
  const overridden = winnerPoints === null ? 0 : 1;
  getDb()
    .prepare(
      `INSERT INTO open_hands (session_id, winner_player_id, winner_points, winner_overridden)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         winner_player_id = excluded.winner_player_id,
         winner_points = excluded.winner_points,
         winner_overridden = excluded.winner_overridden`,
    )
    .run(sessionId, winnerPlayerId, winnerPoints, overridden);
}

export function setWinner(
  sessionId: string,
  auth: DeviceAuth,
  input: { version: unknown; winnerPlayerId: unknown; winnerPoints: unknown },
): SessionView {
  const session = mustGet(sessionId);
  requireAdmin(session, auth);
  if (session.players.length < 2) {
    throw new AppError("Scoring opens when a second player joins");
  }
  if (typeof input.winnerPlayerId !== "string" || !session.players.some((player) => player.id === input.winnerPlayerId)) {
    throw new AppError("Pick a winner from this session");
  }
  const version = readVersion(input.version);
  const winnerPoints = readWinnerPoints(input.winnerPoints);
  const winnerPlayerId = input.winnerPlayerId;
  const db = getDb();

  const write = db.transaction(() => {
    bump(sessionId, version);
    storeWinner(sessionId, winnerPlayerId, winnerPoints);
  });
  write();

  return present(mustGet(sessionId), auth);
}

function clearOpenHand(sessionId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM open_hand_scores WHERE session_id = ?`).run(sessionId);
  db.prepare(
    `UPDATE open_hands
     SET winner_player_id = NULL, winner_points = NULL, winner_overridden = 0
     WHERE session_id = ?`,
  ).run(sessionId);
}

function writeScores(gameId: string, scores: { playerId: string; points: number }[]) {
  const db = getDb();
  db.prepare(`DELETE FROM game_scores WHERE game_id = ?`).run(gameId);
  const insert = db.prepare(
    `INSERT INTO game_scores (game_id, player_id, points) VALUES (?, ?, ?)`,
  );
  for (const score of scores) insert.run(gameId, score.playerId, score.points);
}

function readStoredScores(players: PlayerRow[], winnerPlayerId: string, scores: GameInput["scores"]) {
  try {
    return storeGameScores(
      players.map((player) => player.id),
      winnerPlayerId,
      scores,
    );
  } catch (error) {
    if (error instanceof Error) throw new AppError(error.message);
    throw error;
  }
}

export function saveOpenHand(sessionId: string, auth: DeviceAuth, version: unknown): SessionView {
  const session = mustGet(sessionId);
  requireAdmin(session, auth);
  if (session.players.length < 2) {
    throw new AppError("Scoring opens when a second player joins");
  }
  const expected = readVersion(version);
  const db = getDb();

  const save = db.transaction(() => {
    bump(sessionId, expected);
    const players = loadPlayers(sessionId);
    const openHand = loadOpenHand(sessionId);
    if (!openHand.winnerPlayerId || !players.some((player) => player.id === openHand.winnerPlayerId)) {
      throw new AppError("Pick a winner");
    }
    const byPlayer = new Map(openHand.scores.map((score) => [score.playerId, score.points]));
    if (players.some((player) => !byPlayer.has(player.id))) {
      throw new AppError("Every player needs a score before the hand can be saved");
    }
    const winnerPlayerId = openHand.winnerPlayerId;
    const winnerPoints =
      openHand.winnerOverridden && openHand.winnerPoints !== null
        ? openHand.winnerPoints
        : suggestWinnerPoints(
            players
              .filter((player) => player.id !== winnerPlayerId)
              .map((player) => byPlayer.get(player.id)!),
          );
    const scores = readStoredScores(
      players,
      winnerPlayerId,
      players.map((player) => ({
        playerId: player.id,
        points: player.id === winnerPlayerId ? winnerPoints : byPlayer.get(player.id)!,
      })),
    );
    const gameId = crypto.randomUUID();
    const position = (
      db
        .prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS next FROM games WHERE session_id = ?`)
        .get(sessionId) as { next: number }
    ).next;
    db.prepare(
      `INSERT INTO games (id, session_id, winner_player_id, position, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(gameId, sessionId, winnerPlayerId, position, new Date().toISOString());
    writeScores(gameId, scores);
    clearOpenHand(sessionId);
  });
  save();

  return present(mustGet(sessionId), auth);
}

export function updateGame(
  sessionId: string,
  gameId: string,
  auth: DeviceAuth,
  input: GameInput,
): SessionView {
  const session = mustGet(sessionId);
  requireAdmin(session, auth);
  const version = readVersion(input.version);
  const players = loadPlayers(sessionId);
  const scores = readStoredScores(players, input.winnerPlayerId, input.scores);
  const db = getDb();

  const update = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id FROM games WHERE id = ? AND session_id = ?`)
      .get(gameId, sessionId) as { id: string } | undefined;
    if (!existing) throw new AppError("Game not found", 404);
    bump(sessionId, version);
    db.prepare(`UPDATE games SET winner_player_id = ? WHERE id = ?`).run(input.winnerPlayerId, gameId);
    writeScores(gameId, scores);
  });
  update();

  return present(mustGet(sessionId), auth);
}

export function deleteGame(
  sessionId: string,
  gameId: string,
  auth: DeviceAuth,
  version: unknown,
): SessionView {
  const session = mustGet(sessionId);
  requireAdmin(session, auth);
  const expected = readVersion(version);
  const db = getDb();

  const remove = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id FROM games WHERE id = ? AND session_id = ?`)
      .get(gameId, sessionId) as { id: string } | undefined;
    if (!existing) throw new AppError("Game not found", 404);
    bump(sessionId, expected);
    db.prepare(`DELETE FROM games WHERE id = ? AND session_id = ?`).run(gameId, sessionId);
  });
  remove();

  return present(mustGet(sessionId), auth);
}
