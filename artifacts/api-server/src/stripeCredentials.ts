import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, stripeCredentialsTable } from "@workspace/db";

const credentialsId = 1;

export type StoredStripeCredentials = {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
};

export type StripeCredentialUpdate = {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
};

function encryptionKey() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("Secure credential storage is unavailable.");
  return createHash("sha256").update(sessionSecret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Saved Stripe credentials could not be read.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

async function getRecord() {
  const [record] = await db.select()
    .from(stripeCredentialsTable)
    .where(eq(stripeCredentialsTable.id, credentialsId))
    .limit(1);
  return record;
}

export async function getSavedStripeCredentials(): Promise<StoredStripeCredentials | null> {
  const record = await getRecord();
  if (!record?.encryptedSecretKey) return null;
  return {
    secretKey: decrypt(record.encryptedSecretKey),
    publishableKey: record.encryptedPublishableKey ? decrypt(record.encryptedPublishableKey) : undefined,
    webhookSecret: record.encryptedWebhookSecret ? decrypt(record.encryptedWebhookSecret) : undefined,
  };
}

export async function saveStripeCredentials(update: StripeCredentialUpdate, updatedBy: string) {
  const current = await getRecord();
  const secretKey = update.secretKey || (current?.encryptedSecretKey ? decrypt(current.encryptedSecretKey) : "");
  const publishableKey = update.publishableKey || (current?.encryptedPublishableKey ? decrypt(current.encryptedPublishableKey) : "");
  const webhookSecret = update.webhookSecret || (current?.encryptedWebhookSecret ? decrypt(current.encryptedWebhookSecret) : "");

  if (!secretKey) throw new Error("Add a Stripe secret key before saving.");

  await db.insert(stripeCredentialsTable).values({
    id: credentialsId,
    encryptedSecretKey: encrypt(secretKey),
    encryptedPublishableKey: publishableKey ? encrypt(publishableKey) : null,
    encryptedWebhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
    updatedBy,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: stripeCredentialsTable.id,
    set: {
      encryptedSecretKey: encrypt(secretKey),
      encryptedPublishableKey: publishableKey ? encrypt(publishableKey) : null,
      encryptedWebhookSecret: webhookSecret ? encrypt(webhookSecret) : null,
      updatedBy,
      updatedAt: new Date(),
    },
  });
}

export async function clearSavedStripeCredentials() {
  await db.delete(stripeCredentialsTable).where(eq(stripeCredentialsTable.id, credentialsId));
}