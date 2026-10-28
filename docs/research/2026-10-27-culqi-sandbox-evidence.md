# Culqi sandbox evidence and remaining provider questions

Sandbox investigation dated 2026-10-27 (local) / 2026-10-28 UTC for [Confirm merchant Culqi capabilities and sandbox recovery evidence](https://github.com/meldarstudio/pms/issues/114), under [Wayfinder: online reservations and financial workflows](https://github.com/meldarstudio/pms/issues/109). It extends the documentation-only [Culqi payment contracts research](2026-10-27-culqi-payment-contracts.md) from [#103](https://github.com/meldarstudio/pms/issues/103).

## Scope and limits

All tests ran against the Culqi integration environment with the owner-provided `pk_test_`/`sk_test_` keys from the ignored `apps/backend/.dev.vars`, against API v2 and the public OpenAPI definition #103 hashed. Culqi3DS v1 ran in a local browser page. Webhooks went from owner-configured CulqiPanel test webhooks through a temporary tunnel to a local receiver. Raw responses, payloads and credentials are kept privately outside Git; the detailed redacted records are the #114 comments linked in each section.

No live payment, production configuration, secret change, migration, deployment or application code change occurred. Sandbox results do not establish production entitlements, tariffs or enforcement. Where sandbox and documentation disagree, treat both as unconfirmed until Culqi answers.

## Charges and 3DS

[API evidence](https://github.com/meldarstudio/pms/issues/114#issuecomment-6456402007) and [browser 3DS evidence](https://github.com/meldarstudio/pms/issues/114#issuecomment-6457625027):

- A successful charge returns `201`, `outcome.code` `AUT0000`. Declines return `400` `operacion_denegada` with a specific `code` and `decline_code`, and the error has no charge ID, yet the denied charge appears in `GET /v2/charges`.
- A charge without `capture` returns `capture: null` and `paid: false`. The [capture guide](https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/captura) says such a charge is captured automatically at 12 a.m. `paid` stayed `false` even after an explicit capture. Culqi's own plugins never read `paid`; they treat a non-error, non-`REVIEW` response as success and derive captured/authorized from `capture`.
- Every Visa 3DS fixture first returns `200` `{action_code: "REVIEW"}` with no charge ID, including frictionless cards. The flow guide's codes are right: `200` requires 3DS and `201` is success. The continuation re-sends the same `source_id` and device fingerprint with `authentication_3DS` and returned `201`. Challenge completion took about 74s.
- Failed or timed-out authentication exists only as a browser `error` string, and the attempt is listed as `DNGE0116`. Those listings were unchanged about 1.5h later. The [help center](https://ayuda.culqi.com/portal/es/kb/culqi-wally/cargos-y-devoluciones/por-que-una-venta-en-mi-culqipanel-aparece-rechazada-y-sin-embargo-le-cobraron-al-dueno-de-la-tarjeta) says a sale shown as rejected can still have charged the cardholder after a processor error, regularized manually by Culqi. A denial is therefore not proof that no money moved.
- Mastercard 3DS cases and Checkout v4/CulqiJS browser tokenization were not run.

## Lost responses and duplicates

- Reusing a successfully charged token returns `400` `DNGA9999`, a generic denial. Two concurrent charges on one token produced one `201` and one `429` `CNP0389`.
- A new token for the same card, amount and metadata creates a second successful charge with `duplicated: false`. No SDK or plugin exposes an idempotency key; the only documented custom header is `X-Charge-Channel: recurrent`.
- A charge whose response was aborted was still created and appeared in a list filtered by amount, email and time within about 8s. The `metadata.attempt_id` query filter is ignored, so metadata must be checked client-side. `creation_date_from` accepted seconds or milliseconds.

## Refunds

- Card refunds return `201` with lowercase `status: completa` and `reason` as display text. The charge's `refunds` array stays empty while `amount_refunded` updates.
- Identical refund requests both succeeded: no refund idempotency. The sandbox allowed S/101 refunded on a S/100 charge and reported an inconsistent `current_amount`. The minimum refund is 100 cents.
- An aborted refund request still created the refund. `amount_refunded` updated within 1s, but `GET /v2/refunds` showed it only after about 17s.
- The [refund guide](https://docs.culqi.com/es/documentacion/pagos-online/operaciones/devoluciones/) describes same-day refunds as immediate reversals and later ones as bank refunds that may take 15 to 30 days. Neither the guide nor the help center documents a refund cap, Yape refunds or idempotency. #103 records the 90-day window in the published contract.

## Direct Yape

- The test phone with an arbitrary code returned an `ype_test_` token, and the charge succeeded. Partial and full refunds completed.
- The sandbox source is a simulated Visa test card, so real Yape refund destination, timing and eligibility are not shown. The WooCommerce plugin refunds any Culqi order through the same API without checking the method, which suggests but does not establish Yape refund support.
- A token created for S/30 was charged S/50. The server must bind its own amount.

## Authorize-only and capture

[Capture and update evidence](https://github.com/meldarstudio/pms/issues/114#issuecomment-6458965099):

- `capture: false` returns `201` `AUT0000`, `capture: false`, `paid: false`, and already quotes a fee that changed after capture. The capture guide allows a hold of at most 4 days, after which the money returns to the cardholder automatically.
- `POST /v2/charges/{id}/capture` returned `201` with `capture: true` and `capture_date`. A second capture, or capture after refund, returned **`401`**, which also denotes a bad key. An unknown ID returned `400`. Partial capture is undocumented and was not tried.
- Refunding an uncaptured charge succeeded and left `current_amount` 0. Capture afterwards failed.
- `PATCH /v2/charges/{id}` replaced metadata (`200`). Invalid metadata, an amount under 100 cents and an unknown ID returned `400`.

## Webhooks

[Webhook evidence](https://github.com/meldarstudio/pms/issues/114#issuecomment-6458804012) and the capture/update evidence above:

- CulqiPanel allows one resource/action/result per webhook. Deliveries arrive within about 1s from `axios`. `data` is a JSON string with camelCase keys, and charge payloads include undocumented `chargeFingerprint`, `chargeHash` and `paymentProcessorId`.
- Authentication is an optional per-webhook Basic username and password, off by default. There is no signature or replay protection. Culqi's WooCommerce, Magento and PrestaShop handlers check only those Basic credentials.
- After a `500`, Culqi made 3 attempts about 1s apart and then stopped for good. Each attempt carried a new event ID, failed-attempt IDs are not retrievable from `GET /v2/events/{id}`, and listed events have other IDs. Culqi's timeout is 20s, displayed in panel history as "404 Not Found".
- Failed events carry little or no correlation: `charge.creation.failed` has `chargeId`; `refund.creation.failed`, `charge.capture.failed` and `charge.update.failed` carry only an error message, sometimes with the charge ID embedded in Spanish text. Each `401` capture failure produced two failed events in different shapes.
- No `charge.creation.succeeded` event was recorded for `capture: false` charges, and no `refund.creation.succeeded` for refunding an uncaptured charge.
- Culqi's plugins also handle `charge.status.changed` and `order.status.changed`. Only the order event appears in the plugin setup instructions, and neither was offered in the charge webhook form or tested.

## Implications for the recovery decision

These are evidence for [Decide inventory-hold, payment-recovery, and refund-escalation behavior](https://github.com/meldarstudio/pms/issues/113), not decisions:

- Never charge a new token automatically after an unknown result; reconcile by amount, email and time, then match metadata and source, allowing for list lag.
- The PMS must own charge-attempt and refund idempotency, cumulative refund caps and the expected amount.
- Treat webhooks as authenticated hints: require Basic credentials, acknowledge quickly, then fetch the charge or refund. Deduplicate by resource ID and state transition, never by event ID. Scheduled reconciliation is mandatory because delivery gives up within seconds.
- Do not use `paid` as success evidence or treat every `401` as a credential failure.
- 3DS adds a browser round trip for every enrolled card and can take over a minute of the hold. Failures surface only in the browser, so open attempts expire on the PMS's own deadline.

## Pending checks

- After 00:00 Lima (05:00 UTC) on 2026-10-28, retrieve the earlier charges created without `capture` and confirm they became `capture: true`.
- After 2026-11-01 02:24 UTC, retrieve the authorize-only S/10 charge left uncaptured and confirm its expiry state, and look for any event it emits.

## Questions for Culqi

Sent by the owner; record answers on #114.

1. Account activation for production, and whether the published card and Yape limits, fees and 90-day refund window apply to this merchant.
2. Any charge idempotency mechanism, or a guaranteed lookup for a charge whose response was lost.
3. The meaning of `paid`, and whether `AUT0000` plus `capture` confirms collection.
4. How a merchant learns of a sale shown as rejected (`DNGE0116`) that nevertheless charged the cardholder.
5. Whether `401` for capturing an already captured or refunded charge is intended.
6. Why `capture: false` charges and refunds of uncaptured charges emit no creation events, and whether expiry emits one.
7. Partial capture support.
8. Production refund caps and refund idempotency.
9. Full and partial Yape refunds: support, destination and timing.
10. Whether production validates the Yape token amount against the charge.
11. Fixed source IPs for webhooks.
12. The production retry policy and the recommended duplicate-detection key.
13. Availability and trigger of `charge.status.changed`.

## Source reproducibility

Documentation was read on 2026-10-27/28: the capture, refund, webhook and decline-code guides on docs.culqi.com and the help center's charges and refunds section. Culqi's public repositories [culqi-woocommerce](https://github.com/culqi/culqi-woocommerce), [culqi-magento](https://github.com/culqi/culqi-magento), [culqi-prestashop-1.7](https://github.com/culqi/culqi-prestashop-1.7), [culqi-php](https://github.com/culqi/culqi-php), [culqi-python](https://github.com/culqi/culqi-python) and [culqi-go](https://github.com/culqi/culqi-go) were shallow-cloned from their default branches and searched read-only. Plugin behavior shows Culqi's own integration practice, not a contract. Recheck sources and sandbox behavior before implementation.
