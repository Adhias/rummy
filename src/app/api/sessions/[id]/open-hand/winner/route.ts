import { jsonError, readAuth } from "@/lib/http";
import { setWinner } from "@/lib/sessions";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      version?: unknown;
      winnerPlayerId?: unknown;
      winnerPoints?: unknown;
    };
    const session = setWinner(id, readAuth(request), {
      version: body.version,
      winnerPlayerId: body.winnerPlayerId,
      winnerPoints: body.winnerPoints,
    });
    return Response.json(session);
  } catch (error) {
    return jsonError(error);
  }
}
