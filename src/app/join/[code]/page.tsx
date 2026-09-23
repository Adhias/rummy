import { ScoreApp } from "@/components/score-app";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ScoreApp initialJoinCode={code} />;
}
