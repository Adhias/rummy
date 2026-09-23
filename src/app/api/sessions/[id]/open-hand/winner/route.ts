import { jsonError, readAuth } from "@/lib/http";
import { declareWinner, retractWinner } from "@/lib/sessions";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { version?: unknown };
    return Response.json(declareWinner(id, readAuth(request), body.version));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { version?: unknown };
    return Response.json(retractWinner(id, readAuth(request), body.version));
  } catch (error) {
    return jsonError(error);
  }
}
