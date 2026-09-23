import type { Game, OpenHand, Player, SessionView } from "@/lib/types";

export type SeatChoice = {
  type: "seat";
  version: number;
  playerId: string;
  points: number | null;
  winnerPlayerId: string | null;
  winnerPoints: number | null;
  winnerOverridden: boolean;
};

export type HandSaved = {
  type: "saved";
  version: number;
  openHand: OpenHand;
  game: Game;
  players: Player[];
};

export type LiveEvent = SeatChoice | HandSaved;

type Listener = (event: LiveEvent) => void;

const tables = new Map<string, Set<Listener>>();

export function subscribe(sessionId: string, listener: Listener): () => void {
  const listeners = tables.get(sessionId) ?? new Set();
  listeners.add(listener);
  tables.set(sessionId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) tables.delete(sessionId);
  };
}

export function publish(sessionId: string, event: LiveEvent) {
  const listeners = tables.get(sessionId);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }
}

export function applyLive(session: SessionView, event: LiveEvent): SessionView {
  if (event.version < session.version) return session;
  if (event.type === "seat") return applySeat(session, event);
  return applySaved(session, event);
}

function applySeat(session: SessionView, event: SeatChoice): SessionView {
  const scores = session.openHand.scores.filter((score) => score.playerId !== event.playerId);
  if (event.points !== null) scores.push({ playerId: event.playerId, points: event.points });
  const order = new Map(session.players.map((player) => [player.id, player.position]));
  scores.sort((a, b) => (order.get(a.playerId) ?? 0) - (order.get(b.playerId) ?? 0));
  return {
    ...session,
    version: event.version,
    openHand: {
      scores,
      winnerPlayerId: event.winnerPlayerId,
      winnerPoints: session.role === "admin" ? event.winnerPoints : null,
      winnerOverridden: session.role === "admin" ? event.winnerOverridden : false,
    },
  };
}

function applySaved(session: SessionView, event: HandSaved): SessionView {
  const games = session.games.some((game) => game.id === event.game.id)
    ? session.games
    : [...session.games, event.game];
  return {
    ...session,
    version: event.version,
    players: event.players,
    games,
    rosterOpen: false,
    openHand:
      session.role === "admin"
        ? event.openHand
        : {
            scores: event.openHand.scores,
            winnerPlayerId: event.openHand.winnerPlayerId,
            winnerPoints: null,
            winnerOverridden: false,
          },
  };
}
