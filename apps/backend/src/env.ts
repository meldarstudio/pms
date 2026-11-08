import type { Auth, SignedInAccount } from "./auth";
import type { PropertyCalendar } from "./property-calendar";

export type Env = {
  Variables: { propertyCalendar: PropertyCalendar; auth: Auth; account: SignedInAccount };
  Bindings: {
    DB: D1Database;
    CURRENCY: string;
    PROPERTY_TIME_ZONE: string;
    SESSION_SECRET: string;
    ALLOWED_ORIGINS: string;
    PUBLIC_ALLOWED_ORIGINS: string;
    PUBLISHED_ROOM_TYPE_IDS: string;
    LOGIN_LIMITER: RateLimit;
    SEARCH_LIMITER: RateLimit;
    CULQI_SECRET_KEY?: string;
  };
};
