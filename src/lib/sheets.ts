import { createSign } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { SessionView } from "@/lib/types";

export type SheetRow = Array<string | number>;

type SheetWriter = (row: SheetRow) => Promise<void> | void;

let writer: SheetWriter | null = null;

export function setSheetWriter(next: SheetWriter | null) {
  writer = next;
}

export function finishedHandRow(session: SessionView): SheetRow | null {
  const game = session.games[session.games.length - 1];
  if (!game) return null;
  const seats = [...session.players].sort((a, b) => a.position - b.position);
  const scores = seats.map((seat) => game.scores.find((score) => score.playerId === seat.id)?.points ?? 0);
  const winner = seats.find((seat) => seat.id === game.winnerPlayerId)?.name ?? "";
  return [...scores, winner, game.money];
}

export async function recordSavedHand(session: SessionView): Promise<void> {
  const row = finishedHandRow(session);
  if (!row) return;
  if (writer) {
    await writer(row);
    return;
  }
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!spreadsheetId || !credentials) return;
  await appendGoogleRow(spreadsheetId, credentials, row);
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function readAccount(raw: string): ServiceAccount {
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new AppError("Google credentials are not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new AppError("Google credentials are missing an email or private key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${signer.sign(account.private_key).toString("base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = (await response.json().catch(() => null)) as { access_token?: string } | null;
  if (!response.ok || !body?.access_token) {
    throw new AppError("The hand is saved, but the spreadsheet did not update.");
  }
  return body.access_token;
}

async function appendGoogleRow(spreadsheetId: string, credentials: string, row: SheetRow) {
  const token = await accessToken(readAccount(credentials));
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    },
  );
  if (!response.ok) throw new AppError("The hand is saved, but the spreadsheet did not update.");
}
