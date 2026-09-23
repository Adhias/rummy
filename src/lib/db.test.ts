import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { getDb, resetDb, resolveDatabasePath } from "@/lib/db";

afterEach(() => {
  resetDb();
});

test("resolveDatabasePath prefers RUMMY_DB_PATH", () => {
  expect(
    resolveDatabasePath(
      {
        RUMMY_DB_PATH: "/srv/rummy.sqlite",
        STATE_DIRECTORY: "/var/lib/points-rummy",
      },
      "/nix/store/abc/share/points-rummy",
    ),
  ).toBe("/srv/rummy.sqlite");
});

test("resolveDatabasePath uses the systemd state directory", () => {
  expect(
    resolveDatabasePath(
      { STATE_DIRECTORY: "/var/lib/points-rummy:/var/lib/other" },
      "/nix/store/abc/share/points-rummy",
    ),
  ).toBe("/var/lib/points-rummy/rummy.sqlite");
});

test("resolveDatabasePath keeps local development on data/rummy.sqlite", () => {
  expect(resolveDatabasePath({}, "/home/dev/rummy")).toBe("/home/dev/rummy/data/rummy.sqlite");
});

test("resolveDatabasePath does not place the database in the nix store", () => {
  expect(
    resolveDatabasePath(
      {},
      "/nix/store/mk8ga2g2p1zsx7j67f0r7cdnfqxi8z29-points-rummy-0.1.0/share/points-rummy",
    ),
  ).toBe("/var/lib/points-rummy/rummy.sqlite");
});

test("getDb creates data/rummy.sqlite in the working directory when no service path is set", () => {
  const previousCwd = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), "rummy-cwd-"));
  const previousDb = process.env.RUMMY_DB_PATH;
  const previousState = process.env.STATE_DIRECTORY;
  delete process.env.RUMMY_DB_PATH;
  delete process.env.STATE_DIRECTORY;
  process.chdir(dir);
  try {
    const db = getDb();
    const row = db.prepare("PRAGMA database_list").get() as { file: string };
    expect(row.file).toBe(path.join(dir, "data", "rummy.sqlite"));
  } finally {
    process.chdir(previousCwd);
    if (previousDb === undefined) delete process.env.RUMMY_DB_PATH;
    else process.env.RUMMY_DB_PATH = previousDb;
    if (previousState === undefined) delete process.env.STATE_DIRECTORY;
    else process.env.STATE_DIRECTORY = previousState;
    resetDb();
    rmSync(dir, { recursive: true, force: true });
  }
});
