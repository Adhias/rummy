"use client";

import { useState } from "react";
import { requestJson } from "@/components/api";
import { GameEntry } from "@/components/game-entry";
import { ScoreSheet } from "@/components/score-sheet";
import { SessionSetup } from "@/components/session-setup";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { aheadPlayerIds, formatRupees } from "@/lib/scoring";
import type { Game, SessionDetail, SessionSummary } from "@/lib/types";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function summaryFrom(session: SessionDetail): SessionSummary {
  return {
    id: session.id,
    rupeeValue: session.rupeeValue,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    gameCount: session.games.length,
    players: session.players.map((player) => ({
      id: player.id,
      name: player.name,
      total: player.total,
    })),
  };
}

function aheadLabel(players: SessionSummary["players"], gameCount: number) {
  const ids = new Set(aheadPlayerIds(players, gameCount));
  if (ids.size === 0) return "No games yet";
  const names = players.filter((player) => ids.has(player.id)).map((player) => player.name);
  return `${names.join(" and ")} ahead`;
}

export function ScoreApp({
  initialSessions,
  initialSession,
}: {
  initialSessions: SessionSummary[];
  initialSession: SessionDetail | null;
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [session, setSession] = useState(initialSession);
  const [mode, setMode] = useState<"sheet" | "setup" | "entry">(initialSession ? "sheet" : "setup");
  const [editing, setEditing] = useState<Game | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remember(next: SessionDetail) {
    setSession(next);
    setSessions((current) => [summaryFrom(next), ...current.filter((item) => item.id !== next.id)]);
  }

  function askForNewSession() {
    if (session) {
      setSessionsOpen(false);
      setConfirmNew(true);
      return;
    }
    setEditing(null);
    setMode("setup");
    setSessionsOpen(false);
  }

  async function openSession(id: string) {
    setError(null);
    try {
      const next = await requestJson<SessionDetail>(`/api/sessions/${id}`);
      setSession(next);
      setEditing(null);
      setMode("sheet");
      setSessionsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that session");
    }
  }

  async function rename(playerId: string, name: string) {
    if (!session) return;
    const next = await requestJson<SessionDetail>(
      `/api/sessions/${session.id}/players/${playerId}`,
      { method: "PATCH", body: JSON.stringify({ name }) },
    );
    remember(next);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between gap-3 py-4 text-[#f4efe4]">
        <div>
          <h1 className="font-heading text-3xl leading-none">Points Rummy</h1>
          <p className="mt-1 text-sm text-[#d7c7a4]">
            {session && mode !== "setup"
              ? `${formatRupees(session.rupeeValue)} a point`
              : "One sheet for the table"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-12 px-3" onClick={askForNewSession}>
            New
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 px-3"
            onClick={() => setSessionsOpen(true)}
          >
            Sessions
          </Button>
        </div>
      </header>

      <main className="mb-6 rounded-3xl bg-[#f7f3ea] px-4 py-4 text-[#1c1915] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {mode === "setup" || !session ? (
          <SessionSetup
            onCancel={session ? () => setMode("sheet") : null}
            onCreated={(next) => {
              remember(next);
              setEditing(null);
              setMode("sheet");
            }}
          />
        ) : mode === "entry" ? (
          <GameEntry
            key={editing?.id ?? "new"}
            session={session}
            game={editing}
            onCancel={() => {
              setEditing(null);
              setMode("sheet");
            }}
            onSaved={(next) => {
              remember(next);
              setEditing(null);
              setMode("sheet");
            }}
          />
        ) : (
          <ScoreSheet
            session={session}
            onRename={rename}
            onAdd={() => {
              setEditing(null);
              setMode("entry");
            }}
            onEdit={(game) => {
              setEditing(game);
              setMode("entry");
            }}
            onChange={remember}
          />
        )}
      </main>

      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Sessions</DialogTitle>
            <DialogDescription>Past sheets stay here. Open one to keep scoring it.</DialogDescription>
          </DialogHeader>
          <Button type="button" size="xl" className="w-full" onClick={askForNewSession}>
            New session
          </Button>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] px-3 py-3 text-left"
                    onClick={() => void openSession(item.id)}
                  >
                    <span className="block text-base font-medium">
                      {item.players.map((player) => player.name).join(", ")}
                    </span>
                    <span className="mt-1 block text-sm text-[#5e584e]">
                      {formatWhen(item.updatedAt)} · {item.gameCount}{" "}
                      {item.gameCount === 1 ? "game" : "games"} · {formatRupees(item.rupeeValue)} a
                      point
                    </span>
                    <span className="mt-1 block text-sm">{aheadLabel(item.players, item.gameCount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new session?</DialogTitle>
            <DialogDescription>
              This sheet stays in the list. The new one starts empty, with its own players and
              rupee value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-12" onClick={() => setConfirmNew(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="h-12"
              onClick={() => {
                setConfirmNew(false);
                setSessionsOpen(false);
                setEditing(null);
                setMode("setup");
              }}
            >
              Start new
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
