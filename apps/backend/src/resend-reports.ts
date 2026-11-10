import { z } from "zod";

export const RESEND_REPORT_PATH = "/callbacks/resend";

export const deliveryTypes = [
  "sent",
  "delivered",
  "delivery_delayed",
  "failed",
  "bounced",
  "complained",
  "suppressed",
] as const;
export type DeliveryType = (typeof deliveryTypes)[number];

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const reportSchema = z.object({
  type: z.enum(deliveryTypes.map((type) => `email.${type}` as const)),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({
    email_id: identifier,
    message_id: z.string().max(512).optional(),
    from: z.string().max(512),
    to: z.array(z.email()).max(100),
    tags: z
      .record(
        z.string().max(256),
        z
          .string()
          .max(256)
          .regex(/^[A-Za-z0-9_-]*$/),
      )
      .optional(),
    failed: z.object({ reason: z.string() }).optional(),
    bounce: z.object({ type: z.string(), subType: z.string().optional() }).optional(),
    suppressed: z.object({ type: z.string() }).optional(),
  }),
});

const code = (value: string | undefined) =>
  value && /^[A-Za-z0-9_.-]{1,128}$/.test(value) ? value : undefined;

function senderMailbox(value: string) {
  const candidate = value.includes("<") ? /^.*<([^<>]+)>$/.exec(value)?.[1] : value;
  const parsed = z.email().safeParse(candidate?.trim());
  return parsed.success ? parsed.data.toLowerCase() : null;
}

const lookupSchema = z.object({
  id: identifier,
  last_event: z.enum(deliveryTypes),
  from: z.string().max(512),
  to: z.array(z.email()).max(100),
  message_id: z.string().max(512).nullish(),
  tags: z
    .array(
      z.object({
        name: z.string().max(256),
        value: z
          .string()
          .max(256)
          .regex(/^[A-Za-z0-9_-]*$/),
      }),
    )
    .max(75)
    .optional(),
});

export function decodeResendLookup(value: unknown) {
  const parsed = lookupSchema.safeParse(value);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    id: data.id,
    type: data.last_event,
    sender: senderMailbox(data.from),
    recipientEmail: data.to.length === 1 ? data.to[0]!.toLowerCase() : null,
    messageId: data.message_id ?? null,
    submissionTag: data.tags?.find((tag) => tag.name === "submission_id")?.value ?? null,
    category: data.tags?.find((tag) => tag.name === "category")?.value ?? null,
  };
}

export type ResendLookup = NonNullable<ReturnType<typeof decodeResendLookup>>;

export function decodeResendReport(body: Uint8Array) {
  try {
    const parsed = reportSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body)),
    );
    if (!parsed.success) return null;
    const { data, type, created_at } = parsed.data;
    return {
      type: type.slice(6) as DeliveryType,
      providerMessageId: data.email_id,
      messageId: data.message_id ?? null,
      sender: senderMailbox(data.from),
      recipientEmail: data.to.length === 1 ? data.to[0]!.toLowerCase() : null,
      submissionTag: data.tags?.submission_id ?? null,
      category: data.tags?.category ?? null,
      occurredAt: new Date(created_at).toISOString(),
      details: {
        reason: code(data.failed?.reason),
        bounceType: code(data.bounce?.type),
        bounceSubType: code(data.bounce?.subType),
        permanent: data.bounce?.type === "Permanent",
        suppressionType: code(data.suppressed?.type),
      },
    };
  } catch {
    return null;
  }
}

export async function authenticateResendReport(
  body: Uint8Array,
  headers: Headers,
  secret: string | undefined,
): Promise<string | null> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !/^[A-Za-z0-9_-]{1,256}$/.test(id) || !timestamp || !signatures) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(timestamp)) return null;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(Date.now() / 1000) - seconds) > 300)
    return null;
  if (!secret?.startsWith("whsec_")) return null;
  const keyBytes = base64(secret.slice(6));
  if (!keyBytes?.length) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  for (const signature of signatures.split(" ")) {
    if (!signature.startsWith("v1,")) continue;
    const mac = base64(signature.slice(3));
    if (mac?.length === 32 && (await crypto.subtle.verify("HMAC", key, mac, signed))) return id;
  }
  return null;
}

function base64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}
