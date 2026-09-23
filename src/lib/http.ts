import { AppError } from "@/lib/errors";
import type { DeviceAuth } from "@/lib/types";

export function readAuth(request: Request): DeviceAuth {
  const seat = request.headers.get("x-seat-code")?.trim() ?? "";
  const join = request.headers.get("x-join-code")?.trim() ?? "";
  return {
    seatCode: seat || null,
    joinCode: join || null,
  };
}

export function readVersionHeader(request: Request): unknown {
  const raw = request.headers.get("x-session-version");
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function jsonError(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
