import { jsonError, readAuth } from "@/lib/http";
import { setWinnerPoints } from "@/lib/sessions";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { version?: unknown; winnerPoints?: unknown };
    const session = setWinnerPoints(id, readAuth(request), {
      version: body.version,
      winnerPoints: body.winnerPoints,
    });
    return Response.json(session);
  } catch (error) {
    return jsonError(error);
  }
}
