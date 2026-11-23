import type { ReservationChannel } from "@pms/shared";
import { unrecordedChannel, type StoredReservationChannel } from "../db/schema";

export const presentChannel = (stored: StoredReservationChannel): ReservationChannel =>
  stored === unrecordedChannel ? "unspecified" : stored;

export const storedChannel = (channel: ReservationChannel): StoredReservationChannel =>
  channel === "unspecified" ? unrecordedChannel : channel;
