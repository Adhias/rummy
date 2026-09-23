"use client";

import { useState } from "react";
import { ApiError, requestJson } from "@/components/api";
import { deviceHeaders, type DeviceHeaders } from "@/components/device-memory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { aheadPlayerIds, formatDollars, formatPoints } from "@/lib/scoring";
import type { Game, SessionView } from "@/lib/types";

function pointsClass(points: number): string {
  if (points < 0) return "text-[#1d6b45]";
  if (points > 0) return "text-[#8d3b2b]";
  return "text-[#1c1915]";
}

export function ScoreSheet({
  session,
  auth,
  canEdit,
  writesEnabled,
  hasBar,
  onEdit,
  onChange,
  onWriteError,
  children,
}: {
  session: SessionView;
  auth: DeviceHeaders;
  canEdit: boolean;
  writesEnabled: boolean;
  hasBar: boolean;
  onEdit: (game: Game) => void;
  onChange: (session: SessionView) => void;
  onWriteError: (error: unknown) => void;
  children?: React.ReactNode;
}) {
  const [pendingDelete, setPendingDelete] = useState<Game | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ahead = new Set(aheadPlayerIds(session.players, session.games.length));

  async function removeGame() {
    if (!pendingDelete || !writesEnabled) return;
    setDeleting(true);
    setError(null);
    try {
      const next = await requestJson<SessionView>(
        `/api/sessions/${session.id}/games/${pendingDelete.id}`,
        {
          method: "DELETE",
          headers: {
            ...deviceHeaders(auth),
            "x-session-version": String(session.version),
          },
        },
      );
      setPendingDelete(null);
      onChange(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the game");
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 0)) onWriteError(caught);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={hasBar ? "pb-28" : undefined}>
      <ul className="sticky top-0 z-10 -mx-4 grid grid-cols-2 gap-2 border-b border-[#e4dccb] bg-[#f7f3ea]/95 px-4 py-3 backdrop-blur sm:grid-cols-3">
        {session.players.map((player) => {
          const leading = ahead.has(player.id);
          return (
            <li
              key={player.id}
              className={
                leading
                  ? "rounded-2xl border border-[#c4a15a] bg-[#f8f1dc] px-3 py-2"
                  : "rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] px-3 py-2"
              }
            >
              <p className="text-base font-medium">{player.name}</p>
              <p className={`font-heading text-3xl tabular-nums ${pointsClass(player.total)}`}>
                {formatPoints(player.total)}
              </p>
              {leading && <p className="text-xs font-medium tracking-wide text-[#8a6a2f]">Ahead</p>}
            </li>
          );
        })}
      </ul>

      {children}

      {session.games.length === 0 ? (
        <p className="px-1 py-10 text-center text-base text-[#5e584e]">
          {session.players.length < 2
            ? "Share the code. Scoring opens when a second player joins."
            : "No hands yet."}
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-3 md:hidden">
            {session.games.map((game, index) => {
              const winner = session.players.find((player) => player.id === game.winnerPlayerId);
              return (
                <article key={game.id} className="rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h3 className="font-heading text-xl">Game {index + 1}</h3>
                    <p className="text-sm font-medium">
                      {winner?.name} is owed {formatDollars(game.money)}
                    </p>
                  </div>
                  <ul className="space-y-1">
                    {session.players.map((player) => {
                      const score = game.scores.find((item) => item.playerId === player.id);
                      return (
                        <li key={player.id} className="flex items-baseline justify-between text-lg">
                          <span>{player.name}</span>
                          <span className={`tabular-nums ${pointsClass(score?.points ?? 0)}`}>
                            {formatPoints(score?.points ?? 0)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {canEdit && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12"
                        disabled={!writesEnabled}
                        onClick={() => onEdit(game)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="h-12"
                        disabled={!writesEnabled}
                        onClick={() => setPendingDelete(game)}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-[#e4dccb] text-sm text-[#5e584e]">
                  <th className="px-2 py-2 font-medium">Game</th>
                  {session.players.map((player) => (
                    <th key={player.id} className="px-2 py-2 font-medium">
                      {player.name}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium">Dollars</th>
                  {canEdit && (
                    <th className="px-2 py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {session.games.map((game, index) => (
                  <tr key={game.id} className="border-b border-[#eee6d8]">
                    <td className="px-2 py-3 tabular-nums">{index + 1}</td>
                    {session.players.map((player) => {
                      const score = game.scores.find((item) => item.playerId === player.id);
                      const points = score?.points ?? 0;
                      return (
                        <td
                          key={player.id}
                          className={`px-2 py-3 tabular-nums ${pointsClass(points)} ${
                            player.id === game.winnerPlayerId ? "font-semibold" : ""
                          }`}
                        >
                          {formatPoints(points)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 whitespace-nowrap">{formatDollars(game.money)}</td>
                    {canEdit && (
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10"
                            disabled={!writesEnabled}
                            onClick={() => onEdit(game)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="h-10"
                            disabled={!writesEnabled}
                            onClick={() => setPendingDelete(game)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-lg font-semibold">
                  <td className="px-2 py-3">Total</td>
                  {session.players.map((player) => (
                    <td key={player.id} className={`px-2 py-3 tabular-nums ${pointsClass(player.total)}`}>
                      {formatPoints(player.total)}
                    </td>
                  ))}
                  <td />
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {error && !pendingDelete && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this game?</DialogTitle>
            <DialogDescription>The running totals update as soon as it is gone.</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-12"
              disabled={deleting || !writesEnabled}
              onClick={() => void removeGame()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
