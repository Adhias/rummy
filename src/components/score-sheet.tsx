"use client";

import { useState } from "react";
import { requestJson } from "@/components/api";
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
import type { Game, SessionDetail } from "@/lib/types";

function pointsClass(points: number): string {
  if (points < 0) return "text-[#1d6b45]";
  if (points > 0) return "text-[#8d3b2b]";
  return "text-[#1c1915]";
}

export function ScoreSheet({
  session,
  onRename,
  onAdd,
  onEdit,
  onChange,
}: {
  session: SessionDetail;
  onRename: (playerId: string, name: string) => Promise<void>;
  onAdd: () => void;
  onEdit: (game: Game) => void;
  onChange: (session: SessionDetail) => void;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<Game | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ahead = new Set(aheadPlayerIds(session.players, session.games.length));

  async function commitName(playerId: string, current: string) {
    const next = (names[playerId] ?? current).trim();
    if (!next || next === current) {
      setNames((draft) => {
        const copy = { ...draft };
        delete copy[playerId];
        return copy;
      });
      return;
    }
    try {
      await onRename(playerId, next);
      setNames((draft) => {
        const copy = { ...draft };
        delete copy[playerId];
        return copy;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename");
    }
  }

  async function removeGame() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const next = await requestJson<SessionDetail>(
        `/api/sessions/${session.id}/games/${pendingDelete.id}`,
        { method: "DELETE" },
      );
      setPendingDelete(null);
      onChange(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the game");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="pb-28">
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
              <input
                aria-label={`Rename ${player.name}`}
                value={names[player.id] ?? player.name}
                onChange={(event) =>
                  setNames((draft) => ({ ...draft, [player.id]: event.target.value }))
                }
                onBlur={() => void commitName(player.id, player.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="w-full bg-transparent text-base font-medium outline-none"
              />
              <p className={`font-heading text-3xl tabular-nums ${pointsClass(player.total)}`}>
                {formatPoints(player.total)}
              </p>
              {leading && <p className="text-xs font-medium tracking-wide text-[#8a6a2f]">Ahead</p>}
            </li>
          );
        })}
      </ul>

      {session.games.length === 0 ? (
        <p className="px-1 py-10 text-center text-base text-[#5e584e]">
          No games yet. Add the first hand.
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
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline" className="h-12" onClick={() => onEdit(game)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-12"
                      onClick={() => setPendingDelete(game)}
                    >
                      Delete
                    </Button>
                  </div>
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
                  <th className="px-2 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
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
                    <td className="px-2 py-3">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" className="h-10" onClick={() => onEdit(game)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-10"
                          onClick={() => setPendingDelete(game)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
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
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e4dccb] bg-[#f7f3ea]/95 px-4 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl">
          <Button type="button" size="xl" className="w-full" onClick={onAdd}>
            Add game
          </Button>
        </div>
      </div>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this game?</DialogTitle>
            <DialogDescription>The running totals update as soon as it is gone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" className="h-12" disabled={deleting} onClick={() => void removeGame()}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
