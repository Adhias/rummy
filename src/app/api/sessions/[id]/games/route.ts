import { AppError } from "@/lib/errors";
import { addGame } from "@/lib/sessions";
import type { GameInput } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as GameInput;
    const session = addGame(id, body);
    return Response.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
