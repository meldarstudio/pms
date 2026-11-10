import { createServer } from "node:http";
import { fakeCulqi } from "../../backend/src/test-support/culqi.ts";
import { TURNSTILE_ORIGIN, fakeTurnstile } from "../../backend/src/test-support/turnstile.ts";
import { fakeResend } from "../../backend/src/test-support/resend.ts";

const CULQI_ORIGIN = "https://api.culqi.com";
const TURNSTILE_PATH = "/turnstile/";
const SCRIPT_CULQI = "/__culqi/next";

export function startFakePaymentServices(url) {
  const culqi = fakeCulqi();
  const turnstile = fakeTurnstile();
  const resend = fakeResend();
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const path = request.url ?? "/";
    const parsed = new URL(path, url);
    if (request.method === "GET" && parsed.pathname === "/__resend/emails") {
      const recipient = parsed.searchParams.get("recipient");
      const messages = resend.emails
        .map(({ body }) => JSON.parse(body))
        .filter(({ to }) => to.includes(recipient));
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(messages));
      return;
    }
    if (request.method === "POST" && path === SCRIPT_CULQI) {
      const { call, outcome } = JSON.parse(body);
      culqi.next(call, outcome);
      response.writeHead(204).end();
      return;
    }
    const turnstileCall = path.startsWith(TURNSTILE_PATH);
    const resendCall = parsed.pathname === "/emails" || parsed.pathname.startsWith("/emails/");
    try {
      const reply = await (resendCall ? resend : turnstileCall ? turnstile : culqi).fetch(
        `${resendCall ? url : turnstileCall ? TURNSTILE_ORIGIN : CULQI_ORIGIN}${path}`,
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
