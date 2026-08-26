import { Router, type IRouter, type Request } from "express";
import Stripe from "stripe";
import { checkoutCatalog } from "../checkoutCatalog";
import { getAdminAccess, requireAdmin } from "../adminAuth";
import { getStripeConnectionInfoWithSource, getUncachableStripeClient } from "../stripeClient";
import { clearSavedStripeCredentials, saveStripeCredentials } from "../stripeCredentials";
import { initializeStripe } from "../stripeBootstrap";

type SubmittedCheckoutLine = {
  productId: string;
  variationId?: string;
  quantity: number;
};

type CheckoutLine = SubmittedCheckoutLine & {
  name: string;
  description: string;
  unitAmount: number;
};

const router: IRouter = Router();

function safeText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function parseCheckoutLine(value: unknown): SubmittedCheckoutLine | null {
  if (!value || typeof value !== "object") return null;
  const line = value as Record<string, unknown>;
  const productId = safeText(line.productId, 80);
  const variationId = safeText(line.variationId, 80);
  const quantity = Number(line.quantity);

  if (
    !/^[a-zA-Z0-9_-]+$/.test(productId)
    || (variationId && !/^[a-zA-Z0-9_-]+$/.test(variationId))
    || !Number.isInteger(quantity)
    || quantity < 1
    || quantity > 20
  ) {
    return null;
  }

  return { productId, variationId: variationId || undefined, quantity };
}

function resolveCheckoutLine(line: SubmittedCheckoutLine): CheckoutLine | null {
  if (line.variationId) return null;
  const product = checkoutCatalog[line.productId];
  return product ? { ...line, ...product } : null;
}

function getLineKey(line: CheckoutLine) {
  return `${line.productId}${line.variationId ? `-${line.variationId}` : ""}`;
}

async function getOrCreatePrice(stripe: Stripe, line: CheckoutLine) {
  const lineKey = getLineKey(line);
  const foundProducts = await stripe.products.search({
    query: `metadata['glam_too_key']:'${lineKey}'`,
    limit: 1,
  });
  const product = foundProducts.data[0] ?? await stripe.products.create({
    name: line.name,
    description: line.description || undefined,
    metadata: { glam_too_key: lineKey, glam_too_product_id: line.productId },
  });

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const matchingPrice = prices.data.find((price) =>
    price.unit_amount === line.unitAmount && price.currency === "gbp",
  );

  if (matchingPrice) return matchingPrice;

  return stripe.prices.create({
    product: product.id,
    unit_amount: line.unitAmount,
    currency: "gbp",
    metadata: { glam_too_key: lineKey },
  });
}

function getRequestOrigin(request: Request) {
  const origin = request.get("origin");
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, "");
  return `${request.protocol}://${request.get("host")}`;
}

function credentialText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function credentialMode(value: string, prefix: "sk" | "pk") {
  const match = new RegExp(`^${prefix}_(test|live)_[A-Za-z0-9_]+$`).exec(value);
  return match?.[1] as "test" | "live" | undefined;
}

router.get("/stripe/status", requireAdmin, async (_request, response) => {
  try {
    const { connection, source } = await getStripeConnectionInfoWithSource();
    const mode = connection.secretKey.startsWith("sk_live_") ? "live" : "test";
    response.json({
      connected: true,
      configured: true,
      source,
      mode,
      paymentMethods: ["Card"],
      publishableKeyConfigured: Boolean(connection.publishableKey),
      webhookSecretConfigured: Boolean(connection.webhookSecret),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe is not ready.";
    const connectionAttached = message.includes("Stripe is connected but has no secret key");
    response.status(503).json({
      connected: connectionAttached,
      configured: false,
      mode: "unknown",
      paymentMethods: [],
      publishableKeyConfigured: false,
      webhookSecretConfigured: false,
      error: message,
    });
  }
});

router.put("/stripe/credentials", requireAdmin, async (request, response) => {
  const secretKey = credentialText(request.body?.secretKey);
  const publishableKey = credentialText(request.body?.publishableKey);
  const webhookSecret = credentialText(request.body?.webhookSecret);

  if (secretKey && !credentialMode(secretKey, "sk")) {
    return response.status(400).json({ error: "Enter a valid Stripe secret key beginning with sk_test_ or sk_live_." });
  }
  if (publishableKey && !credentialMode(publishableKey, "pk")) {
    return response.status(400).json({ error: "Enter a valid Stripe publishable key beginning with pk_test_ or pk_live_." });
  }
  if (secretKey && publishableKey && credentialMode(secretKey, "sk") !== credentialMode(publishableKey, "pk")) {
    return response.status(400).json({ error: "Use publishable and secret keys from the same Stripe environment." });
  }
  if (webhookSecret && !/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)) {
    return response.status(400).json({ error: "Enter a valid webhook signing secret beginning with whsec_." });
  }

  try {
    if (secretKey) {
      await new Stripe(secretKey).balance.retrieve();
    }
    const access = await getAdminAccess(request);
    await saveStripeCredentials({
      secretKey: secretKey || undefined,
      publishableKey: publishableKey || undefined,
      webhookSecret: webhookSecret || undefined,
    }, access.userId ?? "admin");
    try {
      await initializeStripe();
    } catch (setupError) {
      const setupMessage = setupError instanceof Error ? setupError.message : "Stripe webhook setup needs attention.";
      request.log?.warn({ error: { message: setupMessage } }, "Stripe credentials saved but setup refresh failed");
    }
    const { connection, source } = await getStripeConnectionInfoWithSource();
    return response.status(201).json({
      connected: true,
      configured: true,
      source,
      mode: connection.secretKey.startsWith("sk_live_") ? "live" : "test",
      paymentMethods: ["Card"],
      publishableKeyConfigured: Boolean(connection.publishableKey),
      webhookSecretConfigured: Boolean(connection.webhookSecret),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe keys could not be saved.";
    request.log?.warn({ error: { message } }, "Stripe credential update failed");
    return response.status(400).json({ error: secretKey ? "Stripe could not verify that secret key. Check it and try again." : message });
  }
});

router.delete("/stripe/credentials", requireAdmin, async (_request, response) => {
  try {
    await clearSavedStripeCredentials();
    return response.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Saved Stripe keys could not be cleared.";
    return response.status(500).json({ error: message });
  }
});

router.post("/stripe/checkout", async (request, response) => {
  try {
    const submittedLines: SubmittedCheckoutLine[] = Array.isArray(request.body?.lines)
      ? (request.body.lines as unknown[])
        .map(parseCheckoutLine)
        .filter((line: SubmittedCheckoutLine | null): line is SubmittedCheckoutLine => line !== null)
      : [];
    const email = safeText(request.body?.email, 250);
    const checkoutLines = submittedLines.map(resolveCheckoutLine);

    if (submittedLines.length === 0 || checkoutLines.some((line) => line === null)) {
      return response.status(400).json({ error: "Your bag is empty or contains an invalid item." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(400).json({ error: "Enter a valid email address to continue." });
    }

    const stripe = await getUncachableStripeClient();
    const lines = checkoutLines as CheckoutLine[];
    if (request.body?.delivery === "express") {
      lines.push({
        productId: "delivery",
        variationId: "express",
        name: "Express delivery",
        description: "1–2 working days",
        unitAmount: 695,
        quantity: 1,
      });
    }
    const priceLines = await Promise.all(lines.map(async (line) => ({
      price: (await getOrCreatePrice(stripe, line)).id,
      quantity: line.quantity,
    })));
    const origin = getRequestOrigin(request);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: priceLines,
      customer_email: email,
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["GB"] },
      success_url: `${origin}/order-confirmation?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      metadata: {
        store: "Glam Too",
        customer_name: safeText(request.body?.customerName, 120),
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    return response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout.";
    return response.status(500).json({ error: message });
  }
});

export default router;