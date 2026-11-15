import type { Auth, SignedInAccount } from "./auth";
import type { PublicCheckout } from "./public-checkouts";
import type { PropertyCalendar } from "./property-calendar";

export type Env = {
  Variables: {
    propertyCalendar: PropertyCalendar;
    auth: Auth;
    account: SignedInAccount;
    checkout: PublicCheckout;
  };
  Bindings: {
    DB: D1Database;
    COMPLAINT_ATTACHMENTS?: R2Bucket;
    CURRENCY: string;
    PROPERTY_TIME_ZONE: string;
    SESSION_SECRET: string;
    ALLOWED_ORIGINS: string;
    PUBLIC_ALLOWED_ORIGINS: string;
    PUBLISHED_ROOM_TYPE_IDS: string;
    LOGIN_LIMITER: RateLimit;
    SEARCH_LIMITER: RateLimit;
    QUOTE_LIMITER: RateLimit;
    PAYMENT_IP_LIMITER: RateLimit;
    PAYMENT_CHECKOUT_LIMITER: RateLimit;
    CULQI_SECRET_KEY?: string;
    CULQI_API_URL?: string;
    RESEND_API_KEY?: string;
    RESEND_API_URL?: string;
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_VERIFY_URL?: string;
  };
};
