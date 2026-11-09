import { createServer } from "node:http";
import { fakeCulqi } from "../../backend/src/test-support/culqi.ts";
import { TURNSTILE_ORIGIN, fakeTurnstile } from "../../backend/src/test-support/turnstile.ts";

const CULQI_ORIGIN = "https://api.culqi.com";
const TURNSTILE_PATH = "/turnstile/";
const SCRIPT_CULQI = "/__culqi/next";

export function startFakePaymentServices(url) {
  const culqi = fakeCulqi();
  const turnstile = fakeTurnstile();
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const path = request.url ?? "/";
    if (request.method === "POST" && path === SCRIPT_CULQI) {
      const { call, outcome } = JSON.parse(body);
      culqi.next(call, outcome);
      response.writeHead(204).end();
      return;
    }
    const turnstileCall = path.startsWith(TURNSTILE_PATH);
    try {
      const reply = await (turnstileCall ? turnstile : culqi).fetch(
        `${turnstileCall ? TURNSTILE_ORIGIN : CULQI_ORIGIN}${path}`,
        {
          method: request.method,
          headers: Object.entries(request.headers).flatMap(([name, value]) =>
            typeof value === "string" ? [[name, value]] : [],
          ),
          body: body || undefined,
        },
      );
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(await reply.text());
    } catch {
      request.socket.destroy();
    }
  });
  const { hostname, port } = new URL(url);
  server.listen(Number(port), hostname);
  return server;
}
