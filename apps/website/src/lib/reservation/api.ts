import { PUBLIC_PMS_API_URL } from "astro:env/client";

export const reservationApiUrl =
  PUBLIC_PMS_API_URL ??
  (import.meta.env.DEV ? "http://localhost:8788" : "https://api.hotelmanantialchurin.com");
