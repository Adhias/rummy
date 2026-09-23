import { ScoreApp } from "@/components/score-app";
import { getSession, listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const sessions = listSessions();
  const current = sessions[0] ? getSession(sessions[0].id) : null;
  return <ScoreApp initialSessions={sessions} initialSession={current} />;
}
