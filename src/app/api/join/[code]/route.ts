import { jsonError, readAuth } from "@/lib/http";
import { viewSessionByJoinCode } from "@/lib/sessions";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    return Response.json(viewSessionByJoinCode(code, readAuth(request)));
  } catch (error) {
    return jsonError(error);
  }
}
