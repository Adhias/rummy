"use client";

import { useMemo, useState } from "react";
import { requestJson } from "@/components/api";
import { CardCounter } from "@/components/card-counter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOUBLE_PACK_POINTS,
  FULL_COUNT_POINTS,
  PACK_POINTS,
  formatDollars,
  gameMoney,
  parsePoints,
  roundLoserPoints,
  suggestWinnerPoints,
} from "@/lib/scoring";
import type { Game, SessionDetail } from "@/lib/types";

const PRESETS = [
  { label: "Pack", aria: "Pack, 20 points", points: PACK_POINTS },
  { label: "Double pack", aria: "Double pack, 40 points", points: DOUBLE_PACK_POINTS },
  { label: "Full count", aria: "Full count, 80 points", points: FULL_COUNT_POINTS },
] as const;

function loserStored(text: string): number | null {
  const parsed = parsePoints(text);
  if (parsed === null || parsed < 0) return null;
  return roundLoserPoints(parsed);
}

export function GameEntry({
  session,
  game,
  onCancel,
  onSaved,
}: {
  session: SessionDetail;
  game: Game | null;
  onCancel: () => void;
  onSaved: (session: SessionDetail) => void;
}) {
  const [winnerId, setWinnerId] = useState<string | null>(game?.winnerPlayerId ?? null);
  const [loserPoints, setLoserPoints] = useState<Record<string, string>>(() => {
    const points: Record<string, string> = {};
    for (const player of session.players) {
      if (!game || player.id === game.winnerPlayerId) {
        points[player.id] = "";
        continue;
      }
      const score = game.scores.find((item) => item.playerId === player.id);
      points[player.id] = score ? String(score.points) : "";
    }
    return points;
  });
  const [winnerPoints, setWinnerPoints] = useState(() => {
    if (!game) return "";
    const score = game.scores.find((item) => item.playerId === game.winnerPlayerId);
    return score ? String(score.points) : "";
  });
  const [winnerTouched, setWinnerTouched] = useState(() => {
    if (!game) return false;
    const losers = game.scores
      .filter((score) => score.playerId !== game.winnerPlayerId)
      .map((score) => score.points);
    const winner = game.scores.find((score) => score.playerId === game.winnerPlayerId);
    return winner?.points !== -losers.reduce((sum, points) => sum + points, 0);
  });
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const suggestion = useMemo(() => {
    if (!winnerId) return null;
    const raw: number[] = [];
    for (const player of session.players) {
      if (player.id === winnerId) continue;
      const parsed = parsePoints(loserPoints[player.id] ?? "");
      if (parsed === null || parsed < 0) return null;
      raw.push(parsed);
    }
    return suggestWinnerPoints(raw);
  }, [loserPoints, session.players, winnerId]);

  function syncWinner(nextLoserPoints: Record<string, string>, nextWinnerId: string | null, touched: boolean) {
    if (touched || !nextWinnerId) return;
    const raw: number[] = [];
    for (const player of session.players) {
      if (player.id === nextWinnerId) continue;
      const parsed = parsePoints(nextLoserPoints[player.id] ?? "");
      if (parsed === null || parsed < 0) {
        setWinnerPoints("");
        return;
      }
      raw.push(parsed);
    }
    setWinnerPoints(String(suggestWinnerPoints(raw)));
  }

  function writeLoser(playerId: string, value: string) {
    const next = { ...loserPoints, [playerId]: value };
    setLoserPoints(next);
    syncWinner(next, winnerId, winnerTouched);
  }

  const roundedLosers = session.players
    .filter((player) => player.id !== winnerId)
    .map((player) => loserStored(loserPoints[player.id] ?? ""))
    .filter((points): points is number => points !== null);
  const money =
    winnerId &&
    roundedLosers.length === session.players.filter((player) => player.id !== winnerId).length
      ? gameMoney(roundedLosers, session.dollarValue)
      : null;
  const winner = session.players.find((player) => player.id === winnerId) ?? null;
  const counterPlayer = session.players.find((player) => player.id === counterFor) ?? null;

  function chooseWinner(playerId: string) {
    if (playerId === winnerId) return;
    setWinnerId(playerId);
    setWinnerTouched(false);
    setWinnerPoints("");
    setLoserPoints(() => {
      const next: Record<string, string> = {};
      for (const player of session.players) next[player.id] = "";
      return next;
    });
    setError(null);
  }

  async function save() {
    if (!winnerId) {
      setError("Pick the winner");
      return;
    }
    const winnerValue = parsePoints(winnerPoints);
    if (winnerValue === null) {
      setError("Enter the winner's points");
      return;
    }
    const scores = [];
    for (const player of session.players) {
      if (player.id === winnerId) {
        scores.push({ playerId: player.id, points: winnerValue });
        continue;
      }
      const parsed = parsePoints(loserPoints[player.id] ?? "");
      if (parsed === null || parsed < 0) {
        setError(`Enter a score for ${player.name}`);
        return;
      }
      scores.push({ playerId: player.id, points: parsed });
    }

    setSaving(true);
    setError(null);
    try {
      const path = game
        ? `/api/sessions/${session.id}/games/${game.id}`
        : `/api/sessions/${session.id}/games`;
      const next = await requestJson<SessionDetail>(path, {
        method: game ? "PATCH" : "POST",
        body: JSON.stringify({ winnerPlayerId: winnerId, scores }),
      });
      onSaved(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the game");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="pb-28"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">{game ? "Edit game" : "New game"}</h2>
        <Button type="button" variant="outline" className="h-12 px-4" onClick={onCancel}>
          Back
        </Button>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who won?</legend>
        <div className="grid grid-cols-2 gap-2">
          {session.players.map((player) => {
            const selected = player.id === winnerId;
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

      {winner && (
        <div className="mt-6 space-y-5">
          {session.players
            .filter((player) => player.id !== winner.id)
            .map((player) => {
              const text = loserPoints[player.id] ?? "";
              const stored = loserStored(text);
              const parsed = parsePoints(text);
              return (
                <div key={player.id} className="rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3">
                  <Label htmlFor={`score-${player.id}`} className="text-base">
                    {player.name}
                  </Label>
                  <Input
                    id={`score-${player.id}`}
                    inputMode="numeric"
                    value={text}
                    onChange={(event) => writeLoser(player.id, event.target.value)}
                    className="mt-2 h-14 text-2xl tabular-nums"
                    placeholder="Points"
                  />
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        type="button"
                        variant={text === String(preset.points) ? "default" : "outline"}
                        aria-label={preset.aria}
                        className="h-16 flex-col gap-0 px-1 text-xs leading-tight whitespace-normal"
                        onClick={() => writeLoser(player.id, String(preset.points))}
                      >
                        <span>{preset.label}</span>
                        <span className="text-base tabular-nums">{preset.points}</span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-11 w-full"
                    onClick={() => setCounterFor(player.id)}
                  >
                    Count cards
                  </Button>
                  {stored !== null && parsed !== null && stored !== parsed && (
                    <p className="mt-1 text-sm text-muted-foreground">Stored as {stored}</p>
                  )}
                  {parsed !== null && parsed < 0 && (
                    <p className="mt-1 text-sm text-destructive">Enter 0 or more</p>
                  )}
                </div>
              );
            })}

          <div className="rounded-2xl border border-[#c4a15a] bg-[#f8f1dc] p-3">
            <Label htmlFor="winner-points" className="text-base">
              {winner.name}&apos;s points
            </Label>
            <Input
              id="winner-points"
              inputMode="text"
              value={winnerPoints}
              onChange={(event) => {
                setWinnerTouched(true);
                setWinnerPoints(event.target.value);
              }}
              className="mt-2 h-14 text-2xl tabular-nums"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {winnerTouched && suggestion !== null
                ? `Calculated is ${suggestion}. This field is what gets saved.`
                : "Starts as the negative of the other scores. Type over it to change it."}
            </p>
            {winnerTouched && (
              <Button
                type="button"
                variant="ghost"
                className="mt-1 h-11 px-0"
                onClick={() => {
                  setWinnerTouched(false);
                  setWinnerPoints(suggestion === null ? "" : String(suggestion));
                }}
              >
                Use calculated
              </Button>
            )}
            {money !== null && (
              <p className="mt-2 text-base font-medium">
                {winner.name} is owed {formatDollars(money)}
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e4dccb] bg-[#f7f3ea]/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl">
          <Button type="submit" size="xl" className="w-full" disabled={saving}>
            {saving ? "Saving…" : game ? "Save changes" : "Save game"}
          </Button>
        </div>
      </div>

      <CardCounter
        open={counterPlayer !== null}
        playerName={counterPlayer?.name ?? ""}
        onOpenChange={(open) => {
          if (!open) setCounterFor(null);
        }}
        onUse={(total) => {
          if (!counterFor) return;
          writeLoser(counterFor, String(total));
          setCounterFor(null);
        }}
      />
    </form>
  );
}
