import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const globalForDb = globalThis as unknown as { rummyDb?: Database.Database };

const serviceDatabase = "/var/lib/points-rummy/rummy.sqlite";

type DatabaseEnv = Record<string, string | undefined>;

export function resolveDatabasePath(env: DatabaseEnv, cwd: string): string {
  const configured = env["RUMMY_DB_PATH"];
  if (configured) return configured;
  const stateDirectory = env["STATE_DIRECTORY"]?.split(":")[0];
  if (stateDirectory) return path.join(stateDirectory, "rummy.sqlite");
  // The standalone server chdirs into its install directory. A Nix package
  // lives in the store, which cannot hold the SQLite file.
  if (cwd === "/nix/store" || cwd.startsWith("/nix/store/")) return serviceDatabase;
  return path.join(cwd, "data", "rummy.sqlite");
}

function databasePath(): string {
  return resolveDatabasePath(process.env, process.cwd());
}

function columnNames(db: Database.Database, table: string): Set<string> {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(columns.map((column) => column.name));
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      point_value REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      join_code TEXT,
      admin_player_id TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL,
      seat_code TEXT
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      winner_player_id TEXT NOT NULL REFERENCES players(id),
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_scores (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id),
      points REAL NOT NULL,
      PRIMARY KEY (game_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS open_hands (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      winner_player_id TEXT,
      winner_points REAL,
      winner_overridden INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS open_hand_scores (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      points REAL NOT NULL,
      PRIMARY KEY (session_id, player_id)
    );
  `);

  let sessionColumns = columnNames(db, "sessions");
  if (sessionColumns.has("rupee_value") && !sessionColumns.has("point_value")) {
    db.exec(`ALTER TABLE sessions RENAME COLUMN rupee_value TO point_value`);
    sessionColumns = columnNames(db, "sessions");
  }
  if (!sessionColumns.has("version")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
  }
  if (!sessionColumns.has("join_code")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN join_code TEXT`);
  }
  if (!sessionColumns.has("admin_player_id")) {
    db.exec(`ALTER TABLE sessions ADD COLUMN admin_player_id TEXT`);
  }

  const playerColumns = columnNames(db, "players");
  if (!playerColumns.has("seat_code")) {
    db.exec(`ALTER TABLE players ADD COLUMN seat_code TEXT`);
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS sessions_join_code ON sessions(join_code) WHERE join_code IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS players_seat_code ON players(seat_code) WHERE seat_code IS NOT NULL;
  `);
}

export function getDb(): Database.Database {
  if (!globalForDb.rummyDb) {
    const file = databasePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    globalForDb.rummyDb = db;
  }
  return globalForDb.rummyDb;
}

export function resetDb() {
  globalForDb.rummyDb?.close();
  globalForDb.rummyDb = undefined;
}
