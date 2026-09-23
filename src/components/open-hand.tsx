"use client";

import { useMemo, useRef, useState } from "react";
import { requestJson } from "@/components/api";
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
  const [text, setText] = useState(serverText);
  const [dirty, setDirty] = useState(false);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(session.openHand.winnerPlayerId);
  const [winnerPending, setWinnerPending] = useState(false);
  const [winnerVersion, setWinnerVersion] = useState<number | null>(null);
  const [pointsText, setPointsText] = useState("");
  const [pointsPending, setPointsPending] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const shownText = dirty ? text : serverText;
  const parsedMine = parsePoints(shownText);
  const mineReady = parsedMine !== null && parsedMine >= 0;
  const held = dirty && draftVersion !== null && draftVersion !== session.version;
  const activeWinnerId = winnerPending ? winnerId : session.openHand.winnerPlayerId;

  const serverScores = useMemo(() => {
    return new Map(session.openHand.scores.map((score) => [score.playerId, score.points]));
  }, [session.openHand.scores]);

  function edit(value: string) {
    setText(value);
    if (value === serverText) {
      setDirty(false);
      setDraftVersion(null);
      return;
    }
    setDirty(true);
    setDraftVersion((current) => (current === null ? session.version : current));
  }

  function fail(caught: unknown) {
    onWriteError(caught);
    setError(caught instanceof Error ? caught.message : "Could not save");
  }

  async function sendScore(version: number): Promise<SessionView | null> {
    if (!mineReady || parsedMine === null) {
      setError("Enter a score of 0 or more");
      return null;
    }
    const next = await requestJson<SessionView>(`/api/sessions/${session.id}/open-hand/score`, {
      method: "PUT",
      headers: deviceHeaders(auth),
      body: JSON.stringify({ version, points: parsedMine }),
    });
    setDirty(false);
    setDraftVersion(null);
    onSession(next);
    return next;
  }

  async function sendWinner(
    version: number,
    playerId: string,
    winnerPoints: number | null,
  ): Promise<SessionView | null> {
    const next = await requestJson<SessionView>(`/api/sessions/${session.id}/open-hand/winner`, {
      method: "PUT",
      headers: deviceHeaders(auth),
      body: JSON.stringify({ version, winnerPlayerId: playerId, winnerPoints }),
    });
    setWinnerPending(false);
    setWinnerVersion(null);
    onSession(next);
    return next;
  }

  async function submitScore() {
    if (!writesEnabled || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await sendScore(session.version);
    } catch (caught) {
      fail(caught);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const suggestion = useMemo(() => {
    if (!activeWinnerId) return null;
    const raw: number[] = [];
    for (const player of session.players) {
      if (player.id === activeWinnerId) continue;
      const points =
        player.id === session.playerId && dirty && mineReady && parsedMine !== null
          ? parsedMine
          : serverScores.get(player.id);
      if (points === undefined) return null;
      raw.push(points);
    }
    return suggestWinnerPoints(raw);
  }, [activeWinnerId, dirty, mineReady, parsedMine, serverScores, session.playerId, session.players]);

  const shownWinnerPoints = pointsPending
    ? pointsText
    : !winnerPending && session.openHand.winnerOverridden && session.openHand.winnerPoints !== null
      ? String(session.openHand.winnerPoints)
      : suggestion === null
        ? ""
        : String(suggestion);

  function chooseWinner(playerId: string) {
    setWinnerId(playerId);
    setWinnerPending(true);
    setWinnerVersion((current) => (current === null ? session.version : current));
    setPointsPending(false);
    setPointsText("");
    setError(null);
    if (!writesEnabled || busy.current) return;
    busy.current = true;
    setSaving(true);
    void sendWinner(session.version, playerId, null)
      .catch((caught) => fail(caught))
      .finally(() => {
        busy.current = false;
        setSaving(false);
      });
  }

  const loserPreview = session.players
    .filter((player) => player.id !== activeWinnerId)
    .map((player) => {
      const points =
        player.id === session.playerId && dirty && mineReady && parsedMine !== null
          ? parsedMine
          : serverScores.get(player.id);
      if (points === undefined) return null;
      return roundLoserPoints(points);
    });
  const money =
    session.role === "admin" && activeWinnerId && loserPreview.every((points) => points !== null)
      ? gameMoney(
          loserPreview.filter((points): points is number => points !== null),
          session.pointValue,
        )
      : null;

  const othersReady = session.players
    .filter((player) => player.id !== session.playerId)
    .every((player) => serverScores.has(player.id));
  const canSave = writesEnabled && mineReady && othersReady && activeWinnerId !== null && !saving;
  const scoreHeld = held;
  const winnerHeld = winnerPending && winnerVersion !== null && winnerVersion !== session.version;
  const me = session.players.find((player) => player.id === session.playerId) ?? null;

  async function saveHand() {
    if (!canSave || !activeWinnerId || busy.current || parsedMine === null) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      let version = session.version;
      if (dirty) {
        const scored = await sendScore(version);
        if (!scored) return;
        version = scored.version;
      }
      if (winnerPending || pointsPending) {
        const winnerPoints = pointsPending ? parsePoints(pointsText) : null;
        if (pointsPending && winnerPoints === null) {
          setError("Enter the winner's points");
          return;
        }
        const picked = await sendWinner(version, activeWinnerId, pointsPending ? winnerPoints : null);
        if (!picked) return;
        version = picked.version;
      }
      const saved = await requestJson<SessionView>(`/api/sessions/${session.id}/open-hand`, {
        method: "POST",
        headers: deviceHeaders(auth),
        body: JSON.stringify({ version }),
      });
      setPointsPending(false);
      setWinnerPending(false);
      setWinnerVersion(null);
      setPointsText("");
      onSession(saved);
    } catch (caught) {
      fail(caught);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const sendLabel = !writesEnabled
    ? offline
      ? "Offline"
      : "Checking the sheet…"
    : scoreHeld
      ? "Send these points"
      : "Send points";

  return (
    <div className="mt-4">
      {session.role === "admin" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Who won?</legend>
          <div className="grid grid-cols-2 gap-2">
            {session.players.map((player) => {
              const selected = player.id === activeWinnerId;
              return (
                <Button
                  key={player.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  className="h-14 text-base"
                  onClick={() => chooseWinner(player.id)}
                >
                  {player.name}
                </Button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-4 space-y-3">
        {session.players.map((player) => {
          if (player.id !== session.playerId) {
            if (session.role !== "admin") return null;
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
                    {stored !== null && stored !== raw && player.id !== activeWinnerId && (
                      <p className="text-sm text-muted-foreground">Stored as {stored}</p>
                    )}
                  </>
                )}
              </div>
            );
          }

          const stored = mineReady && parsedMine !== null ? roundLoserPoints(parsedMine) : null;
          return (
            <div key={player.id} className="rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3">
              <Label htmlFor="my-points" className="text-base">
                Your points
              </Label>
              <Input
                id="my-points"
                inputMode="numeric"
                value={shownText}
                onChange={(event) => edit(event.target.value)}
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
                    onClick={() => edit(String(preset.points))}
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
              {session.role === "seat" ? null : (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-12 w-full"
                  disabled={!writesEnabled || !mineReady || saving || !dirty}
                  onClick={() => void submitScore()}
                >
                  {sendLabel}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {session.role === "admin" && activeWinnerId && (
        <div className="mt-4 rounded-2xl border border-[#c4a15a] bg-[#f8f1dc] p-3">
          <Label htmlFor="winner-points" className="text-base">
            {session.players.find((player) => player.id === activeWinnerId)?.name}&apos;s points
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
                  if (!activeWinnerId) return;
                  setWinnerPending(true);
                  setWinnerVersion((current) => (current === null ? session.version : current));
                  if (!writesEnabled || busy.current) return;
                  busy.current = true;
                  setSaving(true);
                  void sendWinner(session.version, activeWinnerId, null)
                    .catch((caught) => fail(caught))
                    .finally(() => {
                      busy.current = false;
                      setSaving(false);
                    });
                }}
            >
              Use calculated
            </Button>
          )}
          {money !== null && (
            <p className="mt-2 text-base font-medium">
              {session.players.find((player) => player.id === activeWinnerId)?.name} is owed{" "}
              {formatDollars(money)}
            </p>
          )}
        </div>
      )}

      {(scoreHeld || winnerHeld) && (
        <p className="mt-4 text-sm text-[#5e584e]">
          The sheet changed. What you typed stays here until you send it.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e4dccb] bg-[#f7f3ea]/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl">
          {session.role === "admin" ? (
            <Button type="button" size="xl" className="w-full" disabled={!canSave} onClick={() => void saveHand()}>
              {saving ? "Saving…" : scoreHeld || winnerHeld ? "Save this hand" : "Save hand"}
            </Button>
          ) : (
            <Button
              type="button"
              size="xl"
              className="w-full"
              disabled={!writesEnabled || !mineReady || saving || !dirty}
              onClick={() => void submitScore()}
            >
              {saving ? "Sending…" : sendLabel}
            </Button>
          )}
        </div>
      </div>

      <CardCounter
        open={counterOpen}
        playerName={me?.name ?? "your"}
        onOpenChange={setCounterOpen}
        onUse={(total) => {
          edit(String(total));
          setCounterOpen(false);
        }}
      />
    </div>
  );
}
