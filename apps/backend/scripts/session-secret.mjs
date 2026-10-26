import { randomBytes } from "node:crypto";

// Prints a new SESSION_SECRET. Better Auth signs session cookies with it.
console.log(randomBytes(32).toString("base64url"));
