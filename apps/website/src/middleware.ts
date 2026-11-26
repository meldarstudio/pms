import { PUBLIC_PMS_API_URL } from "astro:env/client";
import { defineMiddleware } from "astro/middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.routePattern !== "/habitaciones" && context.routePattern !== "/en/habitaciones") {
    return next();
  }

  const { loadRoomPage } = await import("@/lib/reservation/room-page");
  context.locals.roomPage = await loadRoomPage(
    context.url,
    PUBLIC_PMS_API_URL,
    context.request.headers.get("cf-connecting-ip"),
  );

  const response = await next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  return response;
});
