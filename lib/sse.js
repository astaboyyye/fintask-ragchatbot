// Server-Sent Events: stream the answer to the browser as it is generated.
// EventSource only supports GET, so the client reads this from a fetch() body
// (see streamChat in utils/client.js).

/**
 * Switch an API response into an SSE stream and return a send(event, data)
 * function. Each message is `event: <name>\ndata: <json>\n\n`.
 */
export function openEventStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop proxies from buffering the stream
  });
  res.flushHeaders?.();
  return function send(event, data) {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}
