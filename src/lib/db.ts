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

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      point_value REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
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
  `);

  const columns = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (names.has("rupee_value") && !names.has("point_value")) {
    db.exec(`ALTER TABLE sessions RENAME COLUMN rupee_value TO point_value`);
  }
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
