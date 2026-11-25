import { Buffer } from "node:buffer";
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

export function webPushFixture() {
  const application = createECDH("prime256v1");
  const publicKey = application.generateKeys().toString("base64url");
  const privateScalar = application.getPrivateKey();
  const privateKey = Buffer.alloc(32);
  privateScalar.copy(privateKey, 32 - privateScalar.length);
  const receiver = createECDH("prime256v1");
  const receiverKey = receiver.generateKeys();
  const auth = randomBytes(16);
  return {
    configuration: {
      WEB_PUSH_PUBLIC_KEY: publicKey,
      WEB_PUSH_PRIVATE_KEY: privateKey.toString("base64url"),
    },
    keys: { p256dh: receiverKey.toString("base64url"), auth: auth.toString("base64url") },
    async read(body: BodyInit | null | undefined): Promise<unknown> {
      const record = Buffer.from(await new Response(body).arrayBuffer());
      const salt = record.subarray(0, 16);
      const payloadOffset = 21 + record[20]!;
      const senderKey = record.subarray(21, payloadOffset);
      const sharedSecret = receiver.computeSecret(senderKey);
      const ikm = new Uint8Array(
        hkdfSync(
          "sha256",
          sharedSecret,
          auth,
          Buffer.concat([Buffer.from("WebPush: info\0"), receiverKey, senderKey]),
          32,
        ),
      );
      const key = hkdfSync("sha256", ikm, salt, "Content-Encoding: aes128gcm\0", 16);
      const nonce = hkdfSync("sha256", ikm, salt, "Content-Encoding: nonce\0", 12);
      const decipher = createDecipheriv("aes-128-gcm", Buffer.from(key), Buffer.from(nonce));
      decipher.setAuthTag(record.subarray(-16));
      const decoded = Buffer.concat([
        decipher.update(record.subarray(payloadOffset, -16)),
        decipher.final(),
      ]);
      return JSON.parse(decoded.subarray(0, decoded.lastIndexOf(2)).toString());
    },
  };
}
