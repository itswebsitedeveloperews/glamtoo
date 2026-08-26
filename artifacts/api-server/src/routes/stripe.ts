import { Router, type IRouter, type Request } from "express";
import Stripe from "stripe";
import { checkoutCatalog } from "../checkoutCatalog";
import { getAdminAccess, requireAdmin } from "../adminAuth";
import { getStripeConnectionInfoWithSource, getUncachableStripeClient } from "../stripeClient";
import { clearSavedStripeCredentials, saveStripeCredentials } from "../stripeCredentials";
import { initializeStripe } from "../stripeBootstrap";
import { getAuth } from "@clerk/express";
import { db, pool, orderFulfillmentTable } from "@workspace/db";

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

type FulfillmentStatus = "Processing" | "Shipped" | "Delivered";

const fulfillmentStatuses: FulfillmentStatus[] = ["Processing", "Shipped", "Delivered"];
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout.";
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

router.get("/stripe/payment-config", async (_request, response) => {
  try {
    const { connection } = await getStripeConnectionInfoWithSource();
    if (!connection.publishableKey) {
      return response.status(503).json({
        error: "Stripe is connected, but a publishable key is needed to display card fields.",
      });
    }
    return response.set("Cache-Control", "no-store").json({
      publishableKey: connection.publishableKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe card payments are not available right now.";
    return response.status(503).json({ error: message });
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
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout.";
    request.log?.warn({ error: { message } }, "Stripe credential update failed");
    return response.status(400).json({ error: secretKey ? "Stripe could not verify that secret key. Check it and try again." : message });
  }
});

router.delete("/stripe/credentials", requireAdmin, async (_request, response) => {
  try {
    await clearSavedStripeCredentials();
    return response.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout.";
    return response.status(500).json({ error: message });
  }
});

router.post("/stripe/payment-intent", async (request, response) => {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return response.status(401).json({ error: "Sign in before checkout so your order can be saved." });
    }

    const submittedLines: SubmittedCheckoutLine[] = Array.isArray(request.body?.lines)
      ? (request.body.lines as unknown[])
        .map(parseCheckoutLine)
        .filter((line: SubmittedCheckoutLine | null): line is SubmittedCheckoutLine => line !== null)
      : [];
    const checkoutLines = submittedLines.map(resolveCheckoutLine);
    const email = safeText(request.body?.email, 250);
    const customerName = safeText(request.body?.customerName, 120);
    const phone = safeText(request.body?.phone, 40);
    const address = asRecord(request.body?.address);
    const addressLine1 = safeText(address.line1, 200);
    const addressLine2 = safeText(address.line2, 200);
    const city = safeText(address.city, 100);
    const postcode = safeText(address.postcode, 40);
    const country = safeText(address.country, 2).toUpperCase() || "GB";

    if (submittedLines.length === 0 || checkoutLines.some((line) => line === null)) {
      return response.status(400).json({ error: "Your bag is empty or contains an invalid item." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(400).json({ error: "Enter a valid email address to continue." });
    }
    if (!customerName || !addressLine1 || !city || !postcode || country !== "GB") {
      return response.status(400).json({ error: "Complete your billing and UK delivery address before paying." });
    }

    const lines = checkoutLines as CheckoutLine[];
    const delivery = request.body?.delivery === "express" ? "express" : "standard";
    const deliveryAmount = delivery === "express" ? 695 : 0;
    const amount = lines.reduce((total, line) => total + line.unitAmount * line.quantity, deliveryAmount);
    const orderItems = lines.map((line) => ({
      name: line.name,
      productId: line.productId,
      quantity: line.quantity,
      total: line.unitAmount * line.quantity,
    }));
    const encodedItems = JSON.stringify(orderItems);
    if (encodedItems.length > 450) {
      return response.status(400).json({ error: "Your bag has too many items to pay for in one order." });
    }

    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "gbp",
      payment_method_types: ["card"],
      receipt_email: email,
      description: `Glam Too order for ${customerName}`,
      shipping: {
        name: customerName,
        phone: phone || undefined,
        address: {
          line1: addressLine1,
          line2: addressLine2 || undefined,
          city,
          postal_code: postcode,
          country,
        },
      },
      metadata: {
        store: "Glam Too",
        clerk_user_id: userId,
        customer_name: customerName,
        customer_email: email,
        delivery,
        glam_too_items: encodedItems,
      },
    });

    if (!paymentIntent.client_secret) {
      throw new Error("Stripe did not return a payment secret.");
    }
    return response.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare secure card payment.";
    request.log?.error({ error }, "Stripe payment intent could not be created");
    return response.status(500).json({ error: message });
  }
});

router.post("/stripe/checkout", async (request, response) => {
  try {
    const { userId } = getAuth(request);
    if (!userId) {
      return response.status(401).json({ error: "Sign in before checkout so your order can be saved." });
    }

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
        delivery: request.body?.delivery === "express" ? "express" : "standard",
        clerk_user_id: userId,
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

function orderNumber(stripeSessionId: string) {
  const suffix = stripeSessionId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  return `#GM-${suffix}`;
}

function serializeAddress(value: unknown) {
  const address = asRecord(value);
  return {
    line1: stringValue(address.line1, 200),
    line2: stringValue(address.line2, 200),
    city: stringValue(address.city, 100),
    postcode: stringValue(address.postal_code, 40),
    country: stringValue(address.country, 80),
  };
}

function stringValue(value: unknown, maximumLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

type OrderRow = {
  id: string;
  created: number | null;
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
  customer_details: unknown;
  shipping_details: unknown;
  metadata: unknown;
  fulfillment_status: FulfillmentStatus;
  items: unknown;
};

function orderQuery(userId?: string, stripeSessionId?: string) {
  const ownerFilter = userId ? "AND sessions.metadata ->> 'clerk_user_id' = $1" : "";
  const sessionFilter = stripeSessionId
    ? `AND sessions.id = $${userId ? 2 : 1}`
    : "";
  return {
    text: `
      SELECT
        sessions.id,
        sessions.created,
        sessions.amount_total,
        sessions.currency,
        sessions.customer_email,
        sessions.customer_details,
        sessions.shipping_details,
        sessions.metadata,
        COALESCE(fulfillment.status, 'Processing') AS fulfillment_status,
        COALESCE(
          json_agg(
            json_build_object(
              'name', COALESCE(products.name, line_items.description, 'Glam Too item'),
              'productId', products.metadata ->> 'glam_too_product_id',
              'quantity', COALESCE(line_items.quantity, 1),
              'total', COALESCE(line_items.amount_total, 0)
            )
            ORDER BY line_items.id
          ) FILTER (WHERE line_items.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM stripe.checkout_sessions AS sessions
      LEFT JOIN order_fulfillment AS fulfillment
        ON fulfillment.stripe_session_id = sessions.id
      LEFT JOIN stripe.checkout_session_line_items AS line_items
        ON line_items.checkout_session = sessions.id
      LEFT JOIN stripe.prices AS prices
        ON prices.id = line_items.price
      LEFT JOIN stripe.products AS products
        ON products.id = prices.product
      WHERE sessions.payment_status = 'paid'
        ${ownerFilter}
        ${sessionFilter}
      GROUP BY
        sessions.id,
        sessions.created,
        sessions.amount_total,
        sessions.currency,
        sessions.customer_email,
        sessions.customer_details,
        sessions.shipping_details,
        sessions.metadata,
        fulfillment.status
      ORDER BY sessions.created DESC NULLS LAST
      LIMIT 50`,
    values: [userId, stripeSessionId].filter((value): value is string => Boolean(value)),
  };
}

function serializeOrder(row: OrderRow) {
  const customerDetails = asRecord(row.customer_details);
  const shippingDetails = asRecord(row.shipping_details);
  const metadata = asRecord(row.metadata);
  const deliveryDetails = Object.keys(shippingDetails).length > 0 ? shippingDetails : customerDetails;
  const parsedItems = Array.isArray(row.items) ? row.items : [];

  return {
    id: orderNumber(row.id),
    stripeSessionId: row.id,
    placedAt: row.created ? new Date(row.created * 1000).toISOString() : null,
    status: row.fulfillment_status,
    total: row.amount_total ?? 0,
    currency: row.currency || "gbp",
    email: stringValue(row.customer_email, 250) || stringValue(customerDetails.email, 250),
    delivery: {
      method: metadata.delivery === "express" ? "Express delivery" : "Standard delivery",
      name: stringValue(deliveryDetails.name) || stringValue(customerDetails.name),
      address: serializeAddress(deliveryDetails.address ?? customerDetails.address),
    },
    items: parsedItems.map((item) => {
      const itemRecord = asRecord(item);
      return {
        name: stringValue(itemRecord.name) || "Glam Too item",
        productId: stringValue(itemRecord.productId, 80) || null,
        quantity: Number(itemRecord.quantity) || 1,
        total: Number(itemRecord.total) || 0,
      };
    }),
  };
}

type SerializedOrder = ReturnType<typeof serializeOrder>;

function paymentIntentItems(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => {
      const record = asRecord(item);
      return {
        name: stringValue(record.name) || "Glam Too item",
        productId: stringValue(record.productId, 80) || null,
        quantity: Number(record.quantity) || 1,
        total: Number(record.total) || 0,
      };
    }) : [];
  } catch {
    return [];
  }
}

function serializePaymentIntentOrder(paymentIntent: Stripe.PaymentIntent, fulfillmentStatus: FulfillmentStatus): SerializedOrder {
  const metadata = paymentIntent.metadata ?? {};
  const shipping = asRecord(paymentIntent.shipping);
  return {
    id: orderNumber(paymentIntent.id),
    stripeSessionId: paymentIntent.id,
    placedAt: new Date(paymentIntent.created * 1000).toISOString(),
    status: fulfillmentStatus,
    total: paymentIntent.amount_received || paymentIntent.amount,
    currency: paymentIntent.currency || "gbp",
    email: paymentIntent.receipt_email || metadata.customer_email || "",
    delivery: {
      method: metadata.delivery === "express" ? "Express delivery" : "Standard delivery",
      name: stringValue(shipping.name) || metadata.customer_name || "",
      address: serializeAddress(shipping.address),
    },
    items: paymentIntentItems(metadata.glam_too_items),
  };
}

async function paymentIntentOrders(userId?: string, paymentIntentId?: string): Promise<SerializedOrder[]> {
  const stripe = await getUncachableStripeClient();
  const paymentIntents = await stripe.paymentIntents.list({ limit: 100 });
  const matching = paymentIntents.data.filter((paymentIntent) =>
    paymentIntent.status === "succeeded"
    && paymentIntent.metadata.store === "Glam Too"
    && (!userId || paymentIntent.metadata.clerk_user_id === userId)
    && (!paymentIntentId || paymentIntent.id === paymentIntentId),
  );
  if (matching.length === 0) return [];

  const statusResult = await pool.query<{ stripe_session_id: string; status: FulfillmentStatus }>(
    "SELECT stripe_session_id, status FROM order_fulfillment WHERE stripe_session_id = ANY($1)",
    [matching.map((paymentIntent) => paymentIntent.id)],
  );
  const statuses = new Map(statusResult.rows.map((row) => [row.stripe_session_id, row.status]));
  return matching.map((paymentIntent) => serializePaymentIntentOrder(
    paymentIntent,
    statuses.get(paymentIntent.id) ?? "Processing",
  ));
}

async function allOrders(userId?: string) {
  const query = orderQuery(userId);
  const [sessionOrders, directOrders] = await Promise.all([
    pool.query<OrderRow>(query.text, query.values),
    paymentIntentOrders(userId),
  ]);
  return [
    ...sessionOrders.rows.map(serializeOrder),
    ...directOrders,
  ].sort((left, right) => Date.parse(right.placedAt ?? "") - Date.parse(left.placedAt ?? "")).slice(0, 50);
}

async function getOrderBySessionId(stripeSessionId: string) {
  const query = orderQuery(undefined, stripeSessionId);
  const result = await pool.query<OrderRow>(query.text, query.values);
  return result.rows[0];
}

router.get("/stripe/orders", async (request, response) => {
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to view your orders." });

  try {
    return response.set("Cache-Control", "no-store").json({ orders: await allOrders(userId) });
  } catch (error) {
    request.log?.error({ error }, "Customer orders could not be loaded");
    return response.status(503).json({ error: "Your orders could not be loaded right now." });
  }
});

router.get("/admin/orders", requireAdmin, async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json({ orders: await allOrders() });
  } catch (error) {
    request.log?.error({ error }, "Admin orders could not be loaded");
    return response.status(503).json({ error: "Orders could not be loaded right now." });
  }
});

router.patch("/admin/orders/:stripeSessionId/status", requireAdmin, async (request, response) => {
  const stripeSessionId = safeText(request.params.stripeSessionId, 120);
  const requestedStatus = safeText(request.body?.status, 20);
  const isEmbeddedCardOrder = /^pi_[A-Za-z0-9_]+$/.test(stripeSessionId);
  if ((!/^cs_[A-Za-z0-9_]+$/.test(stripeSessionId) && !isEmbeddedCardOrder) || !fulfillmentStatuses.includes(requestedStatus as FulfillmentStatus)) {
    return response.status(400).json({ error: "Choose a valid order and fulfilment status." });
  }
  const status = requestedStatus as FulfillmentStatus;

  try {
    const existingOrder = isEmbeddedCardOrder
      ? (await paymentIntentOrders(undefined, stripeSessionId))[0]
      : await getOrderBySessionId(stripeSessionId);
    if (!existingOrder) return response.status(404).json({ error: "That paid order could not be found." });

    await db.insert(orderFulfillmentTable).values({
      stripeSessionId,
      status,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: orderFulfillmentTable.stripeSessionId,
      set: { status, updatedAt: new Date() },
    });

    const updatedOrder = isEmbeddedCardOrder
      ? (await paymentIntentOrders(undefined, stripeSessionId))[0]
      : await getOrderBySessionId(stripeSessionId);
    if (!updatedOrder) return response.status(404).json({ error: "That order could not be reloaded." });
    if (isEmbeddedCardOrder) return response.json({ order: updatedOrder });
    return response.json({ order: serializeOrder(updatedOrder as OrderRow) });
  } catch (error) {
    request.log?.error({ error, stripeSessionId }, "Order status could not be updated");
    return response.status(503).json({ error: "Order status could not be updated right now." });
  }
});

export default router;