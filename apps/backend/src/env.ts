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
    LOGIN_LIMITER: RateLimit;
    /** A Culqi secret key: `sk_test_` locally, a Cloudflare secret in production. */
    CULQI_SECRET_KEY?: string;
  };
};
