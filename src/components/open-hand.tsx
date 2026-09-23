"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, requestJson } from "@/components/api";
import { CardCounter } from "@/components/card-counter";
import { deviceHeaders, type DeviceHeaders } from "@/components/device-memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOUBLE_PACK_POINTS,
  FULL_COUNT_POINTS,
  PACK_POINTS,
  formatDollars,
  formatPoints,
  gameMoney,
  parsePoints,
  roundLoserPoints,
  suggestWinnerPoints,
} from "@/lib/scoring";
import type { SessionView } from "@/lib/types";

const PRESETS = [
  { label: "Pack", aria: "Pack, 20 points", points: PACK_POINTS },
  { label: "Double pack", aria: "Double pack, 40 points", points: DOUBLE_PACK_POINTS },
  { label: "Full count", aria: "Full count, 80 points", points: FULL_COUNT_POINTS },
] as const;

export function OpenHand({
  session,
  auth,
  writesEnabled,
  offline,
  onSession,
  onWriteError,
}: {
  session: SessionView;
  auth: DeviceHeaders;
  writesEnabled: boolean;
  offline: boolean;
  onSession: (session: SessionView) => void;
  onWriteError: (error: unknown) => void;
}) {
  const mine = session.openHand.scores.find((score) => score.playerId === session.playerId);
  const serverText = mine ? String(mine.points) : "";
  const [text, setText] = useState<string | null>(null);
  const [pointsText, setPointsText] = useState("");
  const [pointsPending, setPointsPending] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const shownText = text ?? serverText;
  const parsedMine = parsePoints(shownText);
  const winnerId = session.openHand.winnerPlayerId;
  const iAmWinner = session.playerId !== null && winnerId === session.playerId;
  const declaredBy = session.players.find((player) => player.id === winnerId) ?? null;
  const textRef = useRef<string | null>(null);
  const versionRef = useRef(session.version);
  const known = useRef({
    version: session.version,
    points: mine?.points ?? null,
    winner: winnerId,
  });
  const tail = useRef(Promise.resolve());

  useEffect(() => {
    if (session.version < versionRef.current) return;
    versionRef.current = session.version;
    known.current = {
      version: session.version,
      points: mine?.points ?? null,
      winner: session.openHand.winnerPlayerId,
    };
  }, [mine?.points, session.openHand.winnerPlayerId, session.version]);

  const serverScores = useMemo(() => {
    return new Map(session.openHand.scores.map((score) => [score.playerId, score.points]));
  }, [session.openHand.scores]);

  function show(value: string | null) {
    textRef.current = value;
    setText(value);
  }

  function fail(caught: unknown) {
    onWriteError(caught);
    setError(caught instanceof Error ? caught.message : "Could not save");
  }

  function runQueued(task: () => Promise<void>) {
    const run = tail.current.then(task).catch((caught: unknown) => {
      fail(caught);
    });
    tail.current = run.then(
      () => undefined,
      () => undefined,
    );
  }

  async function writeJson(url: string, method: string, body: Record<string, unknown>) {
    const send = (version: number) =>
      requestJson<SessionView>(url, {
        method,
        headers: deviceHeaders(auth),
        body: JSON.stringify({ ...body, version }),
      });
    try {
      return await send(versionRef.current);
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 409) throw caught;
      const fresh = await requestJson<SessionView>(`/api/sessions/${session.id}`, {
        headers: deviceHeaders(auth),
      });
      versionRef.current = fresh.version;
      onSession(fresh);
      return await send(fresh.version);
    }
  }

  function remember(next: SessionView) {
    versionRef.current = next.version;
    const score = next.openHand.scores.find((item) => item.playerId === session.playerId);
    known.current = {
      version: next.version,
      points: score?.points ?? null,
      winner: next.openHand.winnerPlayerId,
    };
    if (textRef.current === null || textRef.current === String(score?.points ?? "")) show(null);
    onSession(next);
  }

  function applyLoss(points: number) {
    show(String(points));
    if (!writesEnabled || !session.playerId) {
      setError(offline ? "Offline" : "Checking the sheet…");
      return;
    }
    setError(null);
    const playerId = session.playerId;
    runQueued(async () => {
      if (known.current.points === points && known.current.winner !== playerId) {
        if (textRef.current === String(points)) show(null);
        return;
      }
      const next = await writeJson(`/api/sessions/${session.id}/open-hand/score`, "PUT", { points });
      remember(next);
    });
  }

  function declareSelf() {
    if (!writesEnabled || !session.playerId || (winnerId !== null && !iAmWinner)) return;
    show(null);
    setError(null);
    const playerId = session.playerId;
    runQueued(async () => {
      if (known.current.winner === playerId) return;
      const next = await writeJson(`/api/sessions/${session.id}/open-hand/winner`, "PUT", {});
      remember(next);
    });
  }

  function takeBack() {
    if (!writesEnabled || !iAmWinner || !session.playerId) return;
    setError(null);
    const playerId = session.playerId;
    runQueued(async () => {
      if (known.current.winner !== playerId) return;
      const next = await writeJson(`/api/sessions/${session.id}/open-hand/winner`, "DELETE", {});
      remember(next);
    });
  }

  const suggestion = useMemo(() => {
    if (!winnerId) return null;
    const raw: number[] = [];
    for (const player of session.players) {
      if (player.id === winnerId) continue;
      const points =
        player.id === session.playerId && parsedMine !== null && parsedMine >= 0 && !iAmWinner
          ? parsedMine
          : serverScores.get(player.id);
      if (points === undefined) return null;
      raw.push(points);
    }
    return suggestWinnerPoints(raw);
  }, [iAmWinner, parsedMine, serverScores, session.playerId, session.players, winnerId]);

  const shownWinnerPoints = pointsPending
    ? pointsText
    : session.openHand.winnerOverridden && session.openHand.winnerPoints !== null
      ? String(session.openHand.winnerPoints)
      : suggestion === null
        ? ""
        : String(suggestion);

  const loserPreview = session.players
    .filter((player) => player.id !== winnerId)
    .map((player) => {
      const points =
        player.id === session.playerId && parsedMine !== null && parsedMine >= 0 && !iAmWinner
          ? parsedMine
          : serverScores.get(player.id);
      if (points === undefined) return null;
      return roundLoserPoints(points);
    });
  const money =
    session.role === "admin" && winnerId && loserPreview.every((points) => points !== null)
      ? gameMoney(
          loserPreview.filter((points): points is number => points !== null),
          session.pointValue,
        )
      : null;

  const losersReady =
    winnerId !== null &&
    session.players.every((player) => player.id === winnerId || serverScores.has(player.id));
  const canSave = session.role === "admin" && writesEnabled && losersReady && !saving;
  const me = session.players.find((player) => player.id === session.playerId) ?? null;

  function saveHand() {
    if (!canSave || !winnerId) return;
    setSaving(true);
    setError(null);
    runQueued(async () => {
      try {
        let version = versionRef.current;
        if (pointsPending) {
          const winnerPoints = parsePoints(pointsText);
          if (winnerPoints === null) {
            setError("Enter the winner's points");
            return;
          }
          const picked = await writeJson(`/api/sessions/${session.id}/open-hand/winner/points`, "PUT", {
            winnerPoints,
          });
          version = picked.version;
          versionRef.current = version;
          known.current.version = version;
          setPointsPending(false);
          setPointsText("");
          onSession(picked);
        }
        const saved = await requestJson<SessionView>(`/api/sessions/${session.id}/open-hand`, {
          method: "POST",
          headers: deviceHeaders(auth),
          body: JSON.stringify({ version }),
        });
        versionRef.current = saved.version;
        setPointsPending(false);
        setPointsText("");
        show(null);
        onSession(saved);
      } finally {
        setSaving(false);
      }
    });
  }

  const declareBlocked = winnerId !== null && !iAmWinner;

  return (
    <div className="mt-4">
      <div className="space-y-3">
        {session.players.map((player) => {
          if (player.id !== session.playerId) {
            if (session.role !== "admin") return null;
            if (player.id === winnerId) {
              return (
                <div key={player.id} className="rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3">
                  <p className="text-base font-medium">{player.name}</p>
                  <p className="mt-1 text-sm text-[#5e584e]">Declared. This seat does not enter a loss.</p>
                </div>
              );
            }
            const raw = serverScores.get(player.id);
            const stored = raw === undefined ? null : roundLoserPoints(raw);
            const waiting = raw === undefined;
            return (
              <div key={player.id} className="rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3">
                <p className="text-base font-medium">{player.name}</p>
                {waiting ? (
                  <p className="mt-1 text-sm text-[#5e584e]">Waiting for {player.name}</p>
                ) : (
                  <>
                    <p className="font-heading text-3xl tabular-nums">{formatPoints(raw)}</p>
                    {stored !== null && stored !== raw && (
                      <p className="text-sm text-muted-foreground">Stored as {stored}</p>
                    )}
                  </>
                )}
              </div>
            );
          }

          const stored = parsedMine !== null && parsedMine >= 0 ? roundLoserPoints(parsedMine) : null;
          return (
            <div key={player.id} className="rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3">
              {iAmWinner && (
                <p className="mb-3 text-sm text-[#5e584e]">
                  You declared. Entering a loss takes that back.
                </p>
              )}
              <Label htmlFor="my-points" className="text-base">
                Points you lost
              </Label>
              <Input
                id="my-points"
                inputMode="numeric"
                value={shownText}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.trim() === "") {
                    show(null);
                    return;
                  }
                  const parsed = parsePoints(value);
                  if (parsed !== null && parsed >= 0) {
                    applyLoss(parsed);
                    return;
                  }
                  show(value);
                }}
                className="mt-2 h-14 text-2xl tabular-nums"
                placeholder="Points"
              />
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={shownText === String(preset.points) ? "default" : "outline"}
                    aria-label={preset.aria}
                    className="h-16 flex-col gap-0 px-1 text-xs leading-tight whitespace-normal"
                    onClick={() => applyLoss(preset.points)}
                  >
                    <span>{preset.label}</span>
                    <span className="text-base tabular-nums">{preset.points}</span>
                  </Button>
                ))}
              </div>
              <Button type="button" variant="ghost" className="mt-2 h-11 w-full" onClick={() => setCounterOpen(true)}>
                Count cards
              </Button>
              {stored !== null && parsedMine !== null && stored !== parsedMine && (
                <p className="mt-1 text-sm text-muted-foreground">Stored as {stored}</p>
              )}
              {parsedMine !== null && parsedMine < 0 && (
                <p className="mt-1 text-sm text-destructive">Enter 0 or more</p>
              )}
              {iAmWinner ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-12 w-full"
                  disabled={!writesEnabled}
                  onClick={() => takeBack()}
                >
                  Take it back
                </Button>
              ) : (
                <Button
                  type="button"
                  className="mt-3 h-12 w-full"
                  disabled={!writesEnabled || declareBlocked}
                  onClick={() => declareSelf()}
                >
                  I won
                </Button>
              )}
              {declareBlocked && declaredBy && (
                <p className="mt-2 text-sm text-[#5e584e]">
                  {declaredBy.name} declared. They have to take it back.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {session.role === "admin" && winnerId && (
        <div className="mt-4 rounded-2xl border border-[#c4a15a] bg-[#f8f1dc] p-3">
          <Label htmlFor="winner-points" className="text-base">
            {declaredBy?.name}&apos;s points
          </Label>
          <Input
            id="winner-points"
            inputMode="text"
            value={shownWinnerPoints}
            onChange={(event) => {
              setPointsPending(true);
              setPointsText(event.target.value);
            }}
            className="mt-2 h-14 text-2xl tabular-nums"
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {pointsPending && suggestion !== null
              ? `Calculated is ${suggestion}. This field is what gets saved.`
              : "Starts as the negative of the other scores. Type over it to change it."}
          </p>
          {pointsPending && (
            <Button
              type="button"
              variant="ghost"
              className="mt-1 h-11 px-0"
              onClick={() => {
                setPointsPending(false);
                setPointsText("");
                if (!winnerId || !writesEnabled) return;
                runQueued(async () => {
                  const next = await writeJson(`/api/sessions/${session.id}/open-hand/winner/points`, "PUT", {
                    winnerPoints: null,
                  });
                  versionRef.current = next.version;
                  known.current.version = next.version;
                  onSession(next);
                });
              }}
            >
              Use calculated
            </Button>
          )}
          {money !== null && (
            <p className="mt-2 text-base font-medium">
              {declaredBy?.name} is owed {formatDollars(money)}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {session.role === "admin" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e4dccb] bg-[#f7f3ea]/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-5xl">
            <Button type="button" size="xl" className="w-full" disabled={!canSave} onClick={() => saveHand()}>
              {saving ? "Saving…" : "Save hand"}
            </Button>
          </div>
        </div>
      )}

      <CardCounter
        open={counterOpen}
        playerName={me?.name ?? "your"}
        onOpenChange={setCounterOpen}
        onUse={(total) => {
          setCounterOpen(false);
          applyLoss(total);
        }}
      />
    </div>
  );
}
