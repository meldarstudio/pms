import type { loadRoomPage } from "@/lib/reservation/room-page";

declare global {
  namespace App {
    interface Locals {
      roomPage?: Awaited<ReturnType<typeof loadRoomPage>>;
    }
  }
}
