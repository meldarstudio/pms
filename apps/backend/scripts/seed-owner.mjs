import { seedLocalOwner } from "./local-owner.mjs";

seedLocalOwner().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
