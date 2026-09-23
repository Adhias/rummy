import { AppError } from "@/lib/errors";
import { renamePlayer } from "@/lib/sessions";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  try {
    const { id, playerId } = await params;
    const body = (await request.json()) as { name?: unknown };
    const session = renamePlayer(id, playerId, body.name);
    return Response.json(session);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
