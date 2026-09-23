import { AppError } from "@/lib/errors";
import { createSession, listSessions } from "@/lib/sessions";

function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

export async function GET() {
  try {
    return Response.json(listSessions());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rupeeValue?: unknown; players?: unknown };
    const session = createSession({
      rupeeValue: body.rupeeValue,
      players: body.players,
    });
    return Response.json(session, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
