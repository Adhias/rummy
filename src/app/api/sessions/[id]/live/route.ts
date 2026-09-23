import { jsonError, readAuth } from "@/lib/http";
import { subscribe, type LiveEvent } from "@/lib/live";
import { viewSession } from "@/lib/sessions";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    viewSession(id, readAuth(request));
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        const send = (chunk: string) => {
          controller.enqueue(encoder.encode(chunk));
        };
        const push = (event: LiveEvent) => {
          send(`data: ${JSON.stringify(event)}\n\n`);
        };
        unsubscribe = subscribe(id, push);
        heartbeat = setInterval(() => send(`: ping\n\n`), 15000);
        request.signal.addEventListener("abort", () => {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
