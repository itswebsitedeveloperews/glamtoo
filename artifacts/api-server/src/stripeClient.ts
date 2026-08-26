import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
import { getSavedStripeCredentials } from "./stripeCredentials";

type StripeConnectionSettings = {
  secret_key?: string;
  publishable_key?: string;
  webhook_secret?: string;
};

export type StripeConnectionInfo = {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
};

export type StripeCredentialSource = "admin" | "connection";

async function getStripeConnectionSettings(): Promise<StripeConnectionSettings> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !token) {
    throw new Error("Stripe connection credentials are unavailable in this environment.");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Unable to read the Stripe connection (${response.status}).`);
  }

  const data = await response.json() as {
    items?: Array<{ settings?: StripeConnectionSettings }>;
  };
  return data.items?.[0]?.settings ?? {};
}

export async function getStripeConnectionInfoWithSource(): Promise<{ connection: StripeConnectionInfo; source: StripeCredentialSource }> {
  const savedCredentials = await getSavedStripeCredentials();
  if (savedCredentials) {
    return { connection: savedCredentials, source: "admin" };
  }

  const settings = await getStripeConnectionSettings();
  if (!settings.secret_key) {
    throw new Error("Stripe is connected but has no secret key configured.");
  }

  return {
    source: "connection",
    connection: {
      secretKey: settings.secret_key,
      publishableKey: settings.publishable_key,
      webhookSecret: settings.webhook_secret,
    },
  };
}

export async function getStripeConnectionInfo(): Promise<StripeConnectionInfo> {
  const { connection } = await getStripeConnectionInfoWithSource();
  return connection;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeConnectionInfo();
  return new Stripe(secretKey);
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe data synchronization.");
  }

  const { secretKey, webhookSecret } = await getStripeConnectionInfo();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}