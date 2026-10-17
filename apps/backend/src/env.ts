export type Env = {
  Bindings: {
    DB: D1Database;
    CURRENCY: string;
    AUTH_USERNAME: string;
    ADMIN_PASSWORD_HASH: string;
    SESSION_SECRET: string;
    ALLOWED_ORIGINS: string;
    LOGIN_LIMITER: RateLimit;
  };
};
