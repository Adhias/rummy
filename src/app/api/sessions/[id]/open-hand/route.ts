import { jsonError, readAuth } from "@/lib/http";
import { saveOpenHand } from "@/lib/sessions";
import { recordSavedHand } from "@/lib/sheets";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { version?: unknown };
    const session = saveOpenHand(id, readAuth(request), body.version);
    await recordSavedHand(session);
    return Response.json(session);
  } catch (error) {
    return jsonError(error);
  }
}
