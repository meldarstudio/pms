import { Effect } from "effect";

export const copyText = (text: string) =>
  Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  );
