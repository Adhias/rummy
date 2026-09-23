import { jsonError, readAuth } from "@/lib/http";
import { addPlayer } from "@/lib/sessions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: unknown; version?: unknown };
    const claim = addPlayer(id, readAuth(request), { name: body.name, version: body.version });
    return Response.json(claim, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
