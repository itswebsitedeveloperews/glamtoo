import { Router, type IRouter, type Request } from "express";
import type Stripe from "stripe";
import { checkoutCatalog } from "../checkoutCatalog";
import { requireAdmin } from "../adminAuth";
import { getStripeConnectionInfo, getUncachableStripeClient } from "../stripeClient";

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

router.get("/stripe/status", requireAdmin, async (_request, response) => {
  try {
    const connection = await getStripeConnectionInfo();
    const mode = connection.secretKey.startsWith("sk_live_") ? "live" : "test";
    response.json({
      connected: true,
      configured: true,
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