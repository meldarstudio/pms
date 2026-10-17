export type Env = {
  Bindings: {
    DB: D1Database;
    CURRENCY: string;
    AUTH_USERNAME: string;
    STAFF_PASSWORD_HASH: string;
    SESSION_SECRET: string;
    ALLOWED_ORIGINS: string;
    LOGIN_LIMITER: RateLimit;
  };
};
