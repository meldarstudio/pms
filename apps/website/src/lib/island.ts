import { Cause, Effect, Exit, FiberHandle, FiberSet, Layer, Scope } from "effect";

export type Latest<R> = {
  replace: (effect: Effect.Effect<unknown, never, R>) => void;
  cancel: () => void;
};

export type Island<R> = {
  fork: (effect: Effect.Effect<unknown, never, R>) => void;
  run: <A>(effect: Effect.Effect<A, never, R>) => Promise<A>;
  latest: () => Latest<R>;
  dispose: () => void;
};

const reportDefects = <A, R>(effect: Effect.Effect<A, never, R>) =>
  Effect.tapCause(effect, (cause) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.void
      : Effect.sync(() => console.error(Cause.pretty(cause))),
  );

export function startIsland<R>(layer: Layer.Layer<R>): Island<R> {
  const scope = Scope.makeUnsafe();
  const context = Effect.runSync(Layer.buildWithScope(layer, scope));
  const inIsland = <A>(effect: Effect.Effect<A, never, R | Scope.Scope>) =>
    Effect.runSync(effect.pipe(Effect.provideContext(context), Scope.provide(scope)));
  const fork = inIsland(FiberSet.makeRuntime<R, unknown, never>());
  const run = inIsland(FiberSet.makeRuntimePromise<R, unknown, never>());
  return {
    fork: (effect) => void fork(reportDefects(effect)),
    run: (effect) => run(reportDefects(effect)),
    latest: () =>
      inIsland(
        Effect.gen(function* () {
          const handle = yield* FiberHandle.make<unknown, never>();
          const start = yield* FiberHandle.runtime(handle)<R>();
          return {
            replace: (effect: Effect.Effect<unknown, never, R>) =>
              void start(reportDefects(effect)),
            cancel: () => void Effect.runFork(FiberHandle.clear(handle)),
          };
        }),
      ),
    dispose: () => void Effect.runFork(Scope.close(scope, Exit.void)),
  };
}
