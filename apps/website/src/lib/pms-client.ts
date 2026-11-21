import { Context, Effect, Layer, Schedule, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
  HttpIncomingMessage,
} from "effect/http";

const READ_ATTEMPT_TIMEOUT = "8 seconds";
const READ_RETRIES = 2;

type Pms = {
  idempotentReads: HttpClient.HttpClient;
  writesSentOnce: HttpClient.HttpClient;
};

export type PmsFailure = HttpClientError.HttpClientError | Schema.SchemaError;

export const pmsFailures = <B, E = never>(recover: () => Effect.Effect<B, E>) =>
  ({ HttpClientError: recover, SchemaError: recover }) satisfies Record<
    PmsFailure["_tag"],
    typeof recover
  >;

const withoutTraceHeadersGuestCorsRejects = Layer.mergeAll(
  Layer.succeed(HttpClient.TracerPropagationEnabled)(false),
  Layer.succeed(HttpClient.TracerDisabledWhen)(() => true),
);

export class PmsClient extends Context.Service<PmsClient, Pms>()("website/PmsClient") {
  static layer(apiBase: string, init: RequestInit = {}) {
    return Layer.effect(
      PmsClient,
      Effect.map(HttpClient.HttpClient, (http) => {
        const client = http.pipe(
          HttpClient.mapRequest((request) =>
            request.pipe(HttpClientRequest.prependUrl(apiBase), HttpClientRequest.acceptJson),
          ),
        );
        return PmsClient.of({
          idempotentReads: client.pipe(
            HttpClient.timeout(READ_ATTEMPT_TIMEOUT),
            HttpClient.retryTransient({
              retryOn: "errors-only",
              schedule: Schedule.exponential("300 millis"),
              times: READ_RETRIES,
            }),
          ),
          writesSentOnce: client,
        });
      }),
    ).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(
        Layer.succeed(FetchHttpClient.RequestInit)({
          credentials: "omit",
          referrerPolicy: "no-referrer",
          ...init,
        }),
      ),
      Layer.provide(withoutTraceHeadersGuestCorsRejects),
    );
  }
}

const authorized = (request: HttpClientRequest.HttpClientRequest, token: string | undefined) =>
  token ? HttpClientRequest.bearerToken(request, token) : request;

export const pmsGet = (
  path: string,
  options: { token?: string; urlParams?: Record<string, string> } = {},
) =>
  PmsClient.use(({ idempotentReads }) =>
    idempotentReads.execute(
      authorized(
        HttpClientRequest.get(path, { urlParams: options.urlParams ?? {} }),
        options.token,
      ),
    ),
  );

export const pmsPost = (path: string, options: { token?: string; body?: unknown } = {}) =>
  PmsClient.use(({ writesSentOnce }) => {
    const request = authorized(HttpClientRequest.post(path), options.token);
    return writesSentOnce.execute(
      options.body === undefined
        ? request
        : HttpClientRequest.bodyJsonUnsafe(request, options.body),
    );
  });

export const ErrorBody = Schema.Struct({ error: Schema.String });

export const errorMessage = (response: HttpClientResponse.HttpClientResponse) =>
  HttpIncomingMessage.schemaBodyJson(ErrorBody)(response).pipe(
    Effect.map(({ error }) => error),
    Effect.orElseSucceed(() => null),
  );

export const isSuccess = (response: HttpClientResponse.HttpClientResponse) =>
  response.status >= 200 && response.status < 300;
