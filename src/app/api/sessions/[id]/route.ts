import { jsonError, readAuth } from "@/lib/http";
import { viewSession } from "@/lib/sessions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json(viewSession(id, readAuth(request)));
  } catch (error) {
    return jsonError(error);
  }
}
