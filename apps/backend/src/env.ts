import type { PropertyCalendar } from "./property-calendar";

export type Env = {
  Variables: { propertyCalendar: PropertyCalendar };
  Bindings: {
    DB: D1Database;
    CURRENCY: string;
    PROPERTY_TIME_ZONE: string;
    AUTH_USERNAME: string;
    STAFF_PASSWORD_HASH: string;
    SESSION_SECRET: string;
    ALLOWED_ORIGINS: string;
    LOGIN_LIMITER: RateLimit;
  };
};
