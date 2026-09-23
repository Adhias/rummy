"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, requestJson } from "@/components/api";
import {
  commitPhoneMemory,
  deviceHeaders,
  emptyMemory,
  forget,
  getPhoneMemorySnapshot,
  getServerPhoneMemory,
  remember,
  subscribePhoneMemory,
  type PhoneMemory,
} from "@/components/device-memory";
import { GameEntry } from "@/components/game-entry";
import { OpenHand } from "@/components/open-hand";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aheadPlayerIds, formatDollars } from "@/lib/scoring";
import type { Game, SeatClaim, SessionView } from "@/lib/types";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function aheadLabel(players: SessionView["players"], gameCount: number) {
  const ids = new Set(aheadPlayerIds(players, gameCount));
  if (ids.size === 0) return "No games yet";
  const names = players.filter((player) => ids.has(player.id)).map((player) => player.name);
  return `${names.join(" and ")} ahead`;
}

function spacedCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function ScoreApp({ initialJoinCode }: { initialJoinCode?: string }) {
  const memoryStore = useSyncExternalStore(
    subscribePhoneMemory,
    getPhoneMemorySnapshot,
    getServerPhoneMemory,
  );
  const memory = memoryStore.memory;
  const memoryReady = memoryStore.source === "phone";
  const [session, setSession] = useState<SessionView | null>(null);
  const [mode, setMode] = useState<"loading" | "setup" | "sheet" | "edit">("loading");
  const [editing, setEditing] = useState<Game | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinText, setJoinText] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [claimName, setClaimName] = useState("");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  const [copied, setCopied] = useState(false);
  const memoryRef = useRef<PhoneMemory>(emptyMemory());
  const sessionRef = useRef<SessionView | null>(null);

  useEffect(() => {
    memoryRef.current = memory;
  }, [memory]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const applySession = useCallback((next: SessionView, seatCode: string | null) => {
    const stored = remember(memoryRef.current, next, seatCode);
    memoryRef.current = stored;
    commitPhoneMemory(stored);
    setSession(next);
    setOffline(false);
    setStale(false);
    setError(null);
  }, []);

  const reloadSession = useCallback(async (id: string, auth = memoryRef.current.sessions.find((item) => item.sessionId === id)) => {
    if (!auth) throw new ApiError("Session not found", 404);
    const next = await requestJson<SessionView>(`/api/sessions/${id}`, {
      headers: deviceHeaders(auth),
    });
    applySession(next, auth.seatCode);
    return next;
  }, [applySession]);

  const refreshActive = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    setStale(true);
    try {
      await reloadSession(current.id);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        const stored = forget(memoryRef.current, current.id);
        memoryRef.current = stored;
        commitPhoneMemory(stored);
        setSession(null);
        setMode("setup");
        setError("That sheet is not on this server.");
        setStale(false);
        return;
      }
      setOffline(true);
      setStale(true);
    }
  }, [reloadSession]);

  useEffect(() => {
    if (!memoryReady) return;
    const stored = memoryRef.current;
    let cancelled = false;

    async function openCode(code: string) {
      const known = stored.sessions.find(
        (item) => item.joinCode.toUpperCase() === code.trim().toUpperCase().replace(/\s+/g, ""),
      );
      try {
        const next = await requestJson<SessionView>(`/api/join/${encodeURIComponent(code.trim())}`, {
          headers: known ? deviceHeaders(known) : {},
        });
        if (cancelled) return;
        applySession(next, next.role === "watch" ? null : (known?.seatCode ?? null));
        setMode("sheet");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not join that table");
        if (stored.activeSessionId) {
          try {
            await reloadSession(stored.activeSessionId);
            if (!cancelled) setMode("sheet");
            return;
          } catch {
            // The phone has no sheet it can open.
          }
        }
        setMode("setup");
      }
    }

    async function openStored(id: string) {
      try {
        await reloadSession(id);
        if (!cancelled) setMode("sheet");
      } catch (caught) {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 404) {
          const next = forget(stored, id);
          memoryRef.current = next;
          commitPhoneMemory(next);
          setError("That sheet is not on this server.");
        } else {
          setOffline(true);
          setStale(true);
          setError("This phone can't reach the server.");
        }
        setMode("setup");
      }
    }

    if (initialJoinCode) {
      void openCode(initialJoinCode);
      return () => {
        cancelled = true;
      };
    }
    if (stored.activeSessionId) {
      void openStored(stored.activeSessionId);
      return () => {
        cancelled = true;
      };
    }
    setMode("setup");
    return () => {
      cancelled = true;
    };
  }, [applySession, initialJoinCode, memoryReady, reloadSession]);

  const sessionId = session?.id ?? null;

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    async function poll() {
      if (stopped || document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setOffline(true);
        setStale(true);
        return;
      }
      try {
        const auth = memoryRef.current.sessions.find((item) => item.sessionId === sessionId);
        if (!auth) return;
        const next = await requestJson<SessionView>(`/api/sessions/${sessionId}`, {
          headers: deviceHeaders(auth),
        });
        if (stopped) return;
        setSession((current) => {
          if (!current || current.id !== next.id) return next;
          if (next.version < current.version) return current;
          return next;
        });
        setOffline(false);
        setStale(false);
        const stored = remember(memoryRef.current, next, null);
        if (
          stored.sessions[0]?.label !==
          memoryRef.current.sessions.find((item) => item.sessionId === next.id)?.label
        ) {
          memoryRef.current = stored;
          commitPhoneMemory(stored);
        }
      } catch (caught) {
        if (stopped) return;
        if (caught instanceof ApiError && caught.status !== 0) return;
        setOffline(true);
        setStale(true);
      }
    }

    const timer = setInterval(() => void poll(), 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  useEffect(() => {
    function onOffline() {
      setOffline(true);
      setStale(true);
    }
    function onOnline() {
      setOffline(false);
      void refreshActive();
    }
    function onVisible() {
      if (document.visibilityState === "visible") void refreshActive();
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshActive]);

  function onWriteError(caught: unknown) {
    if (caught instanceof ApiError && caught.status === 409) {
      void refreshActive();
      return;
    }
    if (!(caught instanceof ApiError) || caught.status === 0) {
      setOffline(true);
      setStale(true);
    }
  }

  const remembered = memory.sessions.find((item) => item.sessionId === session?.id) ?? null;
  const auth = {
    seatCode: remembered?.seatCode ?? null,
    joinCode: session?.joinCode ?? remembered?.joinCode ?? null,
  };
  const writesEnabled = Boolean(session) && !stale && !offline;
  const showHand = Boolean(session && session.players.length >= 2 && session.role !== "watch");

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

  async function openRemembered(id: string) {
    setError(null);
    setStale(true);
    try {
      await reloadSession(id);
      setEditing(null);
      setMode("sheet");
      setSessionsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that session");
      if (caught instanceof ApiError && caught.status === 0) {
        setOffline(true);
        setStale(true);
      } else {
        setStale(false);
      }
    }
  }

  async function joinTyped() {
    setError(null);
    const code = joinText.trim().toUpperCase().replace(/\s+/g, "");
    const known = memoryRef.current.sessions.find((item) => item.joinCode === code);
    try {
      const next = await requestJson<SessionView>(`/api/join/${encodeURIComponent(joinText.trim())}`, {
        headers: known ? deviceHeaders(known) : {},
      });
      applySession(next, next.role === "watch" ? null : (known?.seatCode ?? null));
      setJoinOpen(false);
      setJoinText("");
      setEditing(null);
      setMode("sheet");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join that table");
    }
  }

  async function claimSeat() {
    if (!session || claiming) return;
    const name = claimName.trim();
    if (!name) {
      setClaimError("Enter your name");
      return;
    }
    setClaiming(true);
    setClaimError(null);
    try {
      const claim = await requestJson<SeatClaim>(`/api/sessions/${session.id}/players`, {
        method: "POST",
        headers: deviceHeaders({ seatCode: null, joinCode: session.joinCode }),
        body: JSON.stringify({ name, version: session.version }),
      });
      applySession(claim.session, claim.seatCode);
      setClaimName("");
    } catch (caught) {
      setClaimError(caught instanceof Error ? caught.message : "Could not take a seat");
      onWriteError(caught);
    } finally {
      setClaiming(false);
    }
  }

  async function copyLink() {
    if (!session || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${session.joinCode}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4">
      <header className="flex items-center justify-between gap-3 py-4 text-[#f4efe4]">
        <div>
          <h1 className="font-heading text-3xl leading-none">Points Rummy</h1>
          <p className="mt-1 text-sm text-[#d7c7a4]">
            {session && mode !== "setup"
              ? `${formatDollars(session.pointValue)} a point`
              : "One sheet for the table"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-12 px-3" onClick={askForNewSession}>
            New
          </Button>
          <Button type="button" variant="outline" className="h-12 px-3" onClick={() => setJoinOpen(true)}>
            Join
          </Button>
          <Button type="button" variant="outline" className="h-12 px-3" onClick={() => setSessionsOpen(true)}>
            Sessions
          </Button>
        </div>
      </header>

      <main className="mb-6 rounded-3xl bg-[#f7f3ea] px-4 py-4 text-[#1c1915] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        {error && mode !== "sheet" && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {mode === "loading" ? (
          <p className="py-10 text-center text-base text-[#5e584e]">Opening the sheet…</p>
        ) : mode === "setup" || !session ? (
          <SessionSetup
            onCancel={session ? () => setMode("sheet") : null}
            onCreated={(claim) => {
              applySession(claim.session, claim.seatCode);
              setEditing(null);
              setMode("sheet");
            }}
          />
        ) : (
          <>
            {mode === "edit" && editing && (
              <GameEntry
                key={editing.id}
                session={session}
                game={editing}
                auth={auth}
                writesEnabled={writesEnabled}
                onCancel={() => {
                  setEditing(null);
                  setMode("sheet");
                }}
                onSaved={(next) => {
                  applySession(next, null);
                  setEditing(null);
                  setMode("sheet");
                }}
                onWriteError={onWriteError}
              />
            )}
            <div hidden={mode === "edit"}>
            {(offline || stale) && (
              <p role="status" className="mb-3 text-sm text-[#8a6a2f]">
                {offline ? "Offline. These totals may be out of date." : "These totals may be out of date."}
              </p>
            )}
            <section
              className={
                session.rosterOpen
                  ? "mb-4 rounded-2xl border border-[#c4a15a] bg-[#f8f1dc] p-3"
                  : "mb-4 rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] px-3 py-2"
              }
            >
              <p className="text-sm font-medium">Join code</p>
              <p className={session.rosterOpen ? "font-heading text-4xl tracking-[0.18em]" : "text-lg tracking-[0.18em]"}>
                {spacedCode(session.joinCode)}
              </p>
              {session.rosterOpen && (
                <>
                  <p className="mt-1 text-sm text-[#5e584e]">
                    Other phones join with this code. Scoring opens when two names are on the sheet.
                  </p>
                  <Button type="button" variant="outline" className="mt-2 h-12" onClick={() => void copyLink()}>
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                </>
              )}
            </section>

            {session.role === "watch" && session.rosterOpen && (
              <form
                className="mb-4 rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void claimSeat();
                }}
              >
                <Label htmlFor="claim-name">Your name</Label>
                <Input
                  id="claim-name"
                  value={claimName}
                  autoCapitalize="words"
                  autoComplete="off"
                  onChange={(event) => setClaimName(event.target.value)}
                  className="mt-1 h-12 text-base"
                />
                {claimError && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {claimError}
                  </p>
                )}
                <Button type="submit" className="mt-3 h-12 w-full" disabled={claiming || !writesEnabled}>
                  {claiming ? "Joining…" : "Take a seat"}
                </Button>
              </form>
            )}
            {session.role === "watch" && !session.rosterOpen && (
              <p className="mb-4 text-sm text-[#5e584e]">You&apos;re watching this sheet.</p>
            )}

            <ScoreSheet
              session={session}
              auth={auth}
              canEdit={session.role === "admin"}
              writesEnabled={writesEnabled}
              hasBar={showHand}
              onEdit={(game) => {
                setEditing(game);
                setMode("edit");
              }}
              onChange={(next) => applySession(next, null)}
              onWriteError={onWriteError}
            >
              {showHand && (
                <OpenHand
                  key={session.id}
                  session={session}
                  auth={auth}
                  writesEnabled={writesEnabled}
                  offline={offline}
                  onSession={(next) => applySession(next, null)}
                  onWriteError={onWriteError}
                />
              )}
            </ScoreSheet>
            </div>
          </>
        )}
      </main>

      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Sessions</DialogTitle>
            <DialogDescription>Tables this phone started or joined.</DialogDescription>
          </DialogHeader>
          <Button type="button" size="xl" className="w-full" onClick={askForNewSession}>
            New session
          </Button>
          {memory.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions on this phone yet.</p>
          ) : (
            <ul className="space-y-2">
              {memory.sessions.map((item) => {
                const open = session?.id === item.sessionId ? session : null;
                return (
                  <li key={item.sessionId}>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-[#e4dccb] bg-[#fbf8f2] px-3 py-3 text-left"
                      onClick={() => void openRemembered(item.sessionId)}
                    >
                      <span className="block text-base font-medium">{item.label}</span>
                      <span className="mt-1 block text-sm text-[#5e584e]">
                        Code {spacedCode(item.joinCode)}
                        {open
                          ? ` · ${formatWhen(open.updatedAt)} · ${open.games.length} ${
                              open.games.length === 1 ? "game" : "games"
                            } · ${formatDollars(open.pointValue)} a point`
                          : ""}
                      </span>
                      {open && (
                        <span className="mt-1 block text-sm">{aheadLabel(open.players, open.games.length)}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Join a table</DialogTitle>
            <DialogDescription>Enter the code from the phone that started the session.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void joinTyped();
            }}
          >
            <Label htmlFor="join-code">Code</Label>
            <Input
              id="join-code"
              value={joinText}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(event) => setJoinText(event.target.value)}
              className="mt-1 h-12 text-base tracking-[0.18em]"
            />
            <Button type="submit" size="xl" className="mt-4 w-full">
              Join
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNew} onOpenChange={setConfirmNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new session?</DialogTitle>
            <DialogDescription>
              This sheet stays on this phone. The new one has its own code and dollar value. Other
              phones stay on the sheet they joined.
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
