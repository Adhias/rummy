import type { SessionView } from "@/lib/types";

const KEY = "points-rummy-phone";

export type RememberedSession = {
  sessionId: string;
  joinCode: string;
  seatCode: string | null;
  label: string;
};

export type PhoneMemory = {
  activeSessionId: string | null;
  sessions: RememberedSession[];
};

export type DeviceHeaders = {
  seatCode: string | null;
  joinCode: string | null;
};

export function deviceHeaders(auth: DeviceHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.seatCode) headers["x-seat-code"] = auth.seatCode;
  if (auth.joinCode) headers["x-join-code"] = auth.joinCode;
  return headers;
}

export function emptyMemory(): PhoneMemory {
  return { activeSessionId: null, sessions: [] };
}

export function parseMemory(raw: string | null): PhoneMemory {
  if (!raw) return emptyMemory();
  try {
    const parsed = JSON.parse(raw) as { activeSessionId?: unknown; sessions?: unknown };
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Partial<RememberedSession>;
          if (typeof row.sessionId !== "string" || typeof row.joinCode !== "string") return [];
          if (row.seatCode !== null && typeof row.seatCode !== "string") return [];
          return [
            {
              sessionId: row.sessionId,
              joinCode: row.joinCode,
              seatCode: row.seatCode ?? null,
              label: typeof row.label === "string" && row.label ? row.label : row.joinCode,
            },
          ];
        })
      : [];
    const activeSessionId =
      typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : null;
    return { activeSessionId, sessions };
  } catch {
    return emptyMemory();
  }
}

export function readMemory(): PhoneMemory {
  if (typeof window === "undefined") return emptyMemory();
  return parseMemory(window.localStorage.getItem(KEY));
}

export function writeMemory(memory: PhoneMemory) {
  window.localStorage.setItem(KEY, JSON.stringify(memory));
}

type MemoryStore = { source: "server" | "phone"; memory: PhoneMemory };

const serverStore: MemoryStore = { source: "server", memory: emptyMemory() };
let phoneStore: MemoryStore | null = null;
const memoryListeners = new Set<() => void>();

export function subscribePhoneMemory(listener: () => void) {
  memoryListeners.add(listener);
  return () => memoryListeners.delete(listener);
}

export function getPhoneMemorySnapshot(): MemoryStore {
  if (!phoneStore) phoneStore = { source: "phone", memory: readMemory() };
  return phoneStore;
}

export function getServerPhoneMemory(): MemoryStore {
  return serverStore;
}

export function commitPhoneMemory(memory: PhoneMemory) {
  phoneStore = { source: "phone", memory };
  writeMemory(memory);
  for (const listener of memoryListeners) listener();
}

export function remember(
  memory: PhoneMemory,
  session: SessionView,
  seatCode: string | null,
): PhoneMemory {
  const previous = memory.sessions.find((item) => item.sessionId === session.id);
  const entry: RememberedSession = {
    sessionId: session.id,
    joinCode: session.joinCode,
    seatCode: seatCode ?? previous?.seatCode ?? null,
    label: session.players.map((player) => player.name).join(", ") || session.joinCode,
  };
  return {
    activeSessionId: session.id,
    sessions: [entry, ...memory.sessions.filter((item) => item.sessionId !== session.id)],
  };
}

export function forget(memory: PhoneMemory, sessionId: string): PhoneMemory {
  const sessions = memory.sessions.filter((item) => item.sessionId !== sessionId);
  return {
    activeSessionId: memory.activeSessionId === sessionId ? (sessions[0]?.sessionId ?? null) : memory.activeSessionId,
    sessions,
  };
}
