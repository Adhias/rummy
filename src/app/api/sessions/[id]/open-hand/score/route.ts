import { jsonError, readAuth } from "@/lib/http";
import { setSeatPoints } from "@/lib/sessions";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { version?: unknown; points?: unknown };
    const session = setSeatPoints(id, readAuth(request), { version: body.version, points: body.points });
    return Response.json(session);
  } catch (error) {
    return jsonError(error);
  }
}
