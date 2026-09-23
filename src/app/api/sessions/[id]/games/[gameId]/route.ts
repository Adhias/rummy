import { AppError } from "@/lib/errors";
import { deleteGame, updateGame } from "@/lib/sessions";
import type { GameInput } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; gameId: string }> },
) {
  try {
    const { id, gameId } = await params;
    const body = (await request.json()) as GameInput;
    const session = updateGame(id, gameId, body);
    return Response.json(session);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; gameId: string }> },
) {
  try {
    const { id, gameId } = await params;
    const session = deleteGame(id, gameId);
    return Response.json(session);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
