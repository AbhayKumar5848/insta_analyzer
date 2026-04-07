// GET /api/scrape/progress — SSE stream for real-time scrape progress
import { getProgress } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        try {
          const progress = getProgress();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));

          // Auto-close when done
          if (!progress.active && progress.completed > 0 && progress.completed >= progress.total) {
            clearInterval(interval);
            controller.close();
          }
        } catch (e) {
          clearInterval(interval);
          try { controller.close(); } catch (_) {}
        }
      }, 1000);

      // Clean up on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try { controller.close(); } catch (_) {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
