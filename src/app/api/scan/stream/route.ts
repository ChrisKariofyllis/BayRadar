import { subscribeScanProgress, type ScanProgress } from "@/services/engine/scan-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (progress: ScanProgress) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
      };

      unsubscribe = subscribeScanProgress((progress) => {
        try {
          send(progress);
        } catch {
          unsubscribe();
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
        }
      }, 12_000);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
