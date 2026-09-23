import { jsonError, readAuth, readVersionHeader } from "@/lib/http";
import { deleteGame, updateGame } from "@/lib/sessions";
import type { GameInput } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; gameId: string }> },
) {
  try {
    const { id, gameId } = await params;
    const body = (await request.json()) as GameInput;
    const session = updateGame(id, gameId, readAuth(request), body);
    return Response.json(session);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; gameId: string }> },
) {
  try {
    const { id, gameId } = await params;
    const session = deleteGame(id, gameId, readAuth(request), readVersionHeader(request));
    return Response.json(session);
  } catch (error) {
    return jsonError(error);
  }
}
