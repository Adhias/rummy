import { jsonError } from "@/lib/http";
import { createSession } from "@/lib/sessions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pointValue?: unknown; name?: unknown };
    const claim = createSession({ pointValue: body.pointValue, name: body.name });
    return Response.json(claim, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
