import { Router, type IRouter, type Request } from "express";
import Stripe from "stripe";
import { getAdminAccess, requireAdmin } from "../adminAuth";
import { getStripeConnectionInfoWithSource, getUncachableStripeClient } from "../stripeClient";
import { clearSavedStripeCredentials, saveStripeCredentials } from "../stripeCredentials";
import { initializeStripe } from "../stripeBootstrap";
import { getAuth } from "@clerk/express";
import { pool, orderFulfillmentTable } from "@workspace/db";
import {
  calculateCouponPricing,
  CouponValidationError,
  recordCouponRedemption,
  releaseCouponReservation,
  reserveCouponRedemption,
} from "../couponService";
import {
  commitInventoryReservation,
  getCheckoutCatalogLine,
  getInventoryLevels,
  InventoryError,
  releaseInventoryReservation,
  reserveInventory,
  syncCatalogProduct,
  type CatalogProductInput,
} from "../inventoryService";
import {
  attachOrderPayment,
  cancelPendingOrder,
  createPendingOrder,
  finalizePaidOrder,
  getPaidOrderByPaymentReference,
  getOrderIdByPaymentReference,
  importLegacyPaidOrder,
  listExpiredPendingPayments,
  listPaidOrders,
  saveReconciliationState,
  getReconciliationState,
  setOrderExpiration,
  updateOrderFulfillment,
  recordPaymentResolutionByPaymentReference,
  type FulfillmentStatus,
  type OrderItemSnapshot,
  type PendingOrderInput,
} from "../orderService";
import { attemptPaymentRefund } from "../paymentResolution";
import { calculateIncludedVat, VAT_RATE_PERCENT } from "../taxService";
import { calculateDeliveryAmount, EXPRESS_DELIVERY_AMOUNT } from "../shippingService";

type SubmittedCheckoutLine = {
  productId: string;
  variationId?: string;
  quantity: number;
};

type CheckoutLine = SubmittedCheckoutLine & {
  inventoryKey?: string;
  name: string;
  description: string;
  unitAmount: number;
};

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

async function resolveCheckoutLine(line: SubmittedCheckoutLine): Promise<CheckoutLine | null> {
  const product = await getCheckoutCatalogLine(line.productId, line.variationId);
  return product ? { ...line, ...product } : null;
}

function getLineKey(line: CheckoutLine) {
  return `${line.productId}${line.variationId ? `-${line.variationId}` : ""}`;
}

function couponMetadata(pricing: Awaited<ReturnType<typeof calculateCouponPricing>> | null): Record<string, string> {
  return pricing ? {
    coupon_id: String(pricing.coupon.id),
    coupon_code: pricing.coupon.code,
    coupon_discount: String(pricing.discountAmount),
  } : {};
}

function orderItemSnapshots(lines: CheckoutLine[]): OrderItemSnapshot[] {
  return lines.map((line) => ({
    productId: line.productId,
    variationId: line.variationId,
    inventoryKey: line.inventoryKey,
    name: line.name,
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    total: line.unitAmount * line.quantity,
  }));
}

function orderInput(
  userId: string,
  email: string,
  customerName: string,
  phone: string,
  address: PendingOrderInput["address"],
  delivery: "standard" | "express",
  subtotal: number,
  deliveryAmount: number,
  total: number,
  vatAmount: number,
  pricing: Awaited<ReturnType<typeof calculateCouponPricing>> | null,
  lines: CheckoutLine[],
  expiresAt: Date,
): PendingOrderInput {
  return {
    userId,
    email,
    customerName,
    phone,
    address,
    delivery,
    subtotal,
    deliveryAmount,
    discountAmount: pricing?.discountAmount ?? 0,
    total,
    vatAmount,
    coupon: pricing ? { id: pricing.coupon.id, code: pricing.coupon.code } : undefined,
    expiresAt,
    items: orderItemSnapshots(lines),
  };
}

function paymentDetails(payment: Stripe.PaymentIntent | Stripe.Checkout.Session, isPaymentIntent: boolean) {
  const metadata = payment.metadata ?? {};
  const paymentRecord = asRecord(payment);
  const details = isPaymentIntent
    ? asRecord((payment as Stripe.PaymentIntent).shipping)
    : asRecord(paymentRecord.shipping_details ?? paymentRecord.customer_details);
  const address = asRecord(details.address);
  const customerDetails = isPaymentIntent ? {} : asRecord(paymentRecord.customer_details);
  return {
    email: isPaymentIntent
      ? (payment as Stripe.PaymentIntent).receipt_email || metadata.customer_email
      : safeText(customerDetails.email, 250) || metadata.customer_email,
    customerName: safeText(details.name, 120) || metadata.customer_name,
    phone: safeText(details.phone, 40),
    address: {
      line1: safeText(address.line1, 200),
      line2: safeText(address.line2, 200),
      city: safeText(address.city, 100),
      postcode: safeText(address.postal_code, 40),
      country: safeText(address.country, 2).toUpperCase(),
    },
  };
}

async function recoverExpiredPendingOrders(stripe: Stripe) {
  const expiredOrders = await listExpiredPendingPayments();
  for (const order of expiredOrders) {
    try {
      if (order.payment_type === "payment_intent") {
        const paymentIntent = await stripe.paymentIntents.retrieve(order.payment_reference);
        if (paymentIntent.status === "succeeded") {
          const finalOrder = await finalizePaidOrder(order.id, paymentIntent.id, paymentDetails(paymentIntent, true));
          if (finalOrder) await attemptPaymentRefund(stripe, order.id, finalOrder, paymentIntent, true);
        } else {
          if (paymentIntent.status !== "canceled") {
            await stripe.paymentIntents.cancel(paymentIntent.id);
          }
          await cancelPendingOrder(order.id, paymentIntent.id);
        }
      } else {
        const session = await stripe.checkout.sessions.retrieve(order.payment_reference);
        if (session.payment_status === "paid") {
          const finalOrder = await finalizePaidOrder(order.id, session.id, paymentDetails(session, false));
          if (finalOrder) await attemptPaymentRefund(stripe, order.id, finalOrder, session, false);
        } else {
          if (session.status === "open") {
            await stripe.checkout.sessions.expire(session.id);
          }
          await cancelPendingOrder(order.id, session.id);
        }
      }
    } catch {
      // Stripe remains the authority for a payment that cannot be checked right now.
    }
  }
}

export function startExpiredOrderRecovery() {
  const recover = async () => {
    try {
      await recoverExpiredPendingOrders(await getUncachableStripeClient());
    } catch {
      // A later interval will retry when Stripe is available again.
    }
  };
  void recover();
  setInterval(() => { void recover(); }, 5 * 60 * 1000).unref();
}

function checkoutErrorStatus(error: unknown) {
  return error instanceof CouponValidationError || error instanceof InventoryError ? error.statusCode : 500;
}

async function getOrCreatePrice(stripe: Stripe, line: CheckoutLine) {
  const lineKey = getLineKey(line);
  const existingProducts = await stripe.products.list({ active: true, limit: 100 });
  const product = existingProducts.data.find((candidate) => candidate.metadata.glam_too_key === lineKey) ?? await stripe.products.create({
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

async function findStripeCustomer(stripe: Stripe, userId: string) {
  const customers = await stripe.customers.list({ limit: 100 });
  return customers.data.find((customer) => customer.metadata.clerk_user_id === userId) ?? null;
}

async function getOrCreateStripeCustomer(stripe: Stripe, userId: string, email: string, name: string) {
  const existing = await findStripeCustomer(stripe, userId);
  if (existing) {
    if (existing.email !== email || existing.name !== name) {
      return stripe.customers.update(existing.id, { email, name });
    }
    return existing;
  }
  return stripe.customers.create({
    email,
    name,
    metadata: { clerk_user_id: userId, store: "Glam Too" },
  });
}

function serializePaymentMethod(paymentMethod: Stripe.PaymentMethod) {
  return {
    id: paymentMethod.id,
    brand: paymentMethod.card?.brand || "card",
    last4: paymentMethod.card?.last4 || "",
    expMonth: paymentMethod.card?.exp_month || 0,
    expYear: paymentMethod.card?.exp_year || 0,
  };
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

router.get("/inventory", async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json({ inventory: await getInventoryLevels() });
  } catch (error) {
    request.log?.error({ error }, "Inventory could not be loaded");
    return response.status(503).json({ error: "Stock availability could not be loaded right now." });
  }
});

function inventoryIdentifier(value: unknown) {
  const identifier = typeof value === "string" || typeof value === "number"
    ? String(value).trim().slice(0, 80)
    : "";
  return /^[a-zA-Z0-9_-]+$/.test(identifier) ? identifier : "";
}

function parseCatalogProductInput(value: unknown, productId: string): CatalogProductInput {
  const product = asRecord(value);
  const type = product.type === "Variable" ? "Variable" : product.type === "Simple" ? "Simple" : null;
  const status = product.status === "Published" ? "Published" : product.status === "Draft" ? "Draft" : null;
  const name = safeText(product.name, 200);
  const description = safeText(product.description, 1000);
  const price = safeText(product.price, 40);
  const stock = Number(product.stock);
  const variations = Array.isArray(product.variations)
    ? product.variations.map((variation) => {
      const item = asRecord(variation);
      return {
        id: inventoryIdentifier(item.id),
        size: safeText(item.size, 80),
        colour: safeText(item.colour, 80),
        price: safeText(item.price, 40),
        stock: Number(item.stock),
      };
    })
    : [];
  if (!type || !status || !name || !Number.isInteger(stock) || stock < 0) {
    throw new InventoryError("Enter a product name and a whole stock quantity before saving.");
  }
  if (
    type === "Variable"
    && (!variations.length
      || variations.some((variation) => !variation.id || !Number.isInteger(variation.stock) || variation.stock < 0)
      || new Set(variations.map((variation) => variation.id)).size !== variations.length)
  ) {
    throw new InventoryError("Every variation needs a unique identifier and a whole stock quantity.");
  }
  return { id: productId, name, description, price, stock, status, type, variations };
}

router.put("/admin/catalog/products/:productId", requireAdmin, async (request, response) => {
  const productId = inventoryIdentifier(request.params.productId);
  try {
    if (!productId) throw new InventoryError("That product identifier is not valid.");
    await syncCatalogProduct(parseCatalogProductInput(request.body, productId));
    return response.json({ productId, inventory: await getInventoryLevels() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product inventory could not be updated.";
    const statusCode = error instanceof InventoryError ? error.statusCode : 503;
    request.log?.error({ error, productId }, "Catalog inventory update failed");
    return response.status(statusCode).json({ error: message });
  }
});

router.get("/stripe/payment-methods", async (request, response) => {
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to view your saved payment methods." });

  try {
    const stripe = await getUncachableStripeClient();
    const customer = await findStripeCustomer(stripe, userId);
    if (!customer) return response.set("Cache-Control", "no-store").json({ paymentMethods: [] });
    const paymentMethods = await stripe.paymentMethods.list({ customer: customer.id, type: "card" });
    return response.set("Cache-Control", "no-store").json({
      paymentMethods: paymentMethods.data.map(serializePaymentMethod),
    });
  } catch (error) {
    request.log?.error({ error }, "Saved payment methods could not be loaded");
    return response.status(503).json({ error: "Your saved payment methods could not be loaded right now." });
  }
});

router.post("/stripe/payment-method-setup", async (request, response) => {
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to save a payment method." });

  const email = safeText(request.body?.email, 250);
  const name = safeText(request.body?.name, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    return response.status(400).json({ error: "Enter your name and a valid email address before saving a card." });
  }

  try {
    const stripe = await getUncachableStripeClient();
    const customer = await getOrCreateStripeCustomer(stripe, userId, email, name);
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ["card"],
      usage: "off_session",
    });
    if (!setupIntent.client_secret) throw new Error("Stripe did not return a setup secret.");
    return response.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    request.log?.error({ error }, "Payment method setup could not be started");
    return response.status(503).json({ error: "A saved card could not be set up right now." });
  }
});

router.delete("/stripe/payment-methods/:paymentMethodId", async (request, response) => {
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to remove a payment method." });
  const paymentMethodId = safeText(request.params.paymentMethodId, 120);
  if (!/^pm_[A-Za-z0-9_]+$/.test(paymentMethodId)) return response.status(400).json({ error: "Choose a valid payment method." });

  try {
    const stripe = await getUncachableStripeClient();
    const customer = await findStripeCustomer(stripe, userId);
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!customer || paymentMethod.customer !== customer.id) return response.status(404).json({ error: "That payment method was not found." });
    await stripe.paymentMethods.detach(paymentMethodId);
    return response.status(204).send();
  } catch (error) {
    request.log?.error({ error }, "Payment method could not be removed");
    return response.status(503).json({ error: "That payment method could not be removed right now." });
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
    const checkoutLines = await Promise.all(submittedLines.map(resolveCheckoutLine));
    const email = safeText(request.body?.email, 250);
    const customerName = safeText(request.body?.customerName, 120);
    const phone = safeText(request.body?.phone, 40);
    const paymentMethodId = safeText(request.body?.paymentMethodId, 120);
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
    if (paymentMethodId && !/^pm_[A-Za-z0-9_]+$/.test(paymentMethodId)) {
      return response.status(400).json({ error: "Choose a valid saved payment method." });
    }

    const lines = checkoutLines as CheckoutLine[];
    const subtotal = lines.reduce((total, line) => total + line.unitAmount * line.quantity, 0);
    const delivery = request.body?.delivery === "express" ? "express" : "standard";
    const deliveryAmount = calculateDeliveryAmount(delivery, subtotal);
    const couponCode = safeText(request.body?.couponCode, 80);
    const pricing = couponCode ? await calculateCouponPricing(couponCode, subtotal, deliveryAmount) : null;
    const amount = pricing?.total ?? subtotal + deliveryAmount;
    const vatAmount = pricing?.vatAmount ?? calculateIncludedVat(amount);
    if (amount < 30) {
      return response.status(400).json({ error: "This coupon makes the order too small for card payment. Add another item or use a different coupon." });
    }
    const order = await createPendingOrder(orderInput(
      userId,
      email,
      customerName,
      phone,
      {
        line1: addressLine1,
        line2: addressLine2,
        city,
        postcode,
        country,
      },
      delivery,
      subtotal,
      deliveryAmount,
      amount,
      vatAmount,
      pricing,
      lines,
      new Date(Date.now() + 30 * 60 * 1000),
    ));

    const stripe = await getUncachableStripeClient();
    await recoverExpiredPendingOrders(stripe);
    const customer = await getOrCreateStripeCustomer(stripe, userId, email, customerName);
    if (paymentMethodId) {
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.customer !== customer.id) {
        return response.status(403).json({ error: "That saved payment method does not belong to your account." });
      }
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "gbp",
      payment_method_types: ["card"],
      customer: customer.id,
      payment_method: paymentMethodId || undefined,
      setup_future_usage: "off_session",
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
        glam_too_order_id: order.id,
        clerk_user_id: userId,
        customer_name: customerName,
        customer_email: email,
        delivery,
        vat_rate_percent: String(VAT_RATE_PERCENT),
        vat_amount: String(vatAmount),
         ...couponMetadata(pricing),
      },
    });
    if (!paymentIntent.client_secret) {
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => undefined);
      await cancelPendingOrder(order.id, paymentIntent.id).catch(() => undefined);
      throw new Error("Stripe did not return a payment secret.");
    }
    try {
      await attachOrderPayment(order.id, paymentIntent.id, "payment_intent");
      await reserveInventory(lines.filter((line): line is CheckoutLine & { inventoryKey: string } => Boolean(line.inventoryKey)), paymentIntent.id);
      if (pricing) {
        await reserveCouponRedemption(
          pricing.coupon,
          paymentIntent.id,
          userId,
          new Date(Date.now() + 30 * 60 * 1000),
        );
      }
    } catch (error) {
      await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => undefined);
      await cancelPendingOrder(order.id, paymentIntent.id).catch(() => undefined);
      throw error;
    }
    return response.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare secure card payment.";
    request.log?.error({ error }, "Stripe payment intent could not be created");
    return response.status(checkoutErrorStatus(error)).json({ error: message });
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
    const customerName = safeText(request.body?.customerName, 120);
    const phone = safeText(request.body?.phone, 40);
    const address = asRecord(request.body?.address);
    const addressLine1 = safeText(address.line1, 200);
    const addressLine2 = safeText(address.line2, 200);
    const city = safeText(address.city, 100);
    const postcode = safeText(address.postcode, 40);
    const country = safeText(address.country, 2).toUpperCase() || "GB";
    const checkoutLines = await Promise.all(submittedLines.map(resolveCheckoutLine));

    if (submittedLines.length === 0 || checkoutLines.some((line) => line === null)) {
      return response.status(400).json({ error: "Your bag is empty or contains an invalid item." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response.status(400).json({ error: "Enter a valid email address to continue." });
    }

    const lines = [...checkoutLines] as CheckoutLine[];
    const inventoryLines = [...lines];
    const subtotal = lines.reduce((total, line) => total + line.unitAmount * line.quantity, 0);
    const delivery = request.body?.delivery === "express" ? "express" : "standard";
    const deliveryAmount = calculateDeliveryAmount(delivery, subtotal);
    const couponCode = safeText(request.body?.couponCode, 80);
    const pricing = couponCode ? await calculateCouponPricing(couponCode, subtotal, deliveryAmount) : null;
    const amount = pricing?.total ?? subtotal + deliveryAmount;
    const vatAmount = pricing?.vatAmount ?? calculateIncludedVat(amount);
    if (amount < 30) {
      return response.status(400).json({ error: "This coupon makes the order too small for card payment. Add another item or use a different coupon." });
    }
    const order = await createPendingOrder(orderInput(
      userId,
      email,
      customerName,
      phone,
      {
        line1: addressLine1,
        line2: addressLine2,
        city,
        postcode,
        country,
      },
      delivery,
      subtotal,
      deliveryAmount,
      amount,
      vatAmount,
      pricing,
      inventoryLines,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    ));
    const stripe = await getUncachableStripeClient();
    await recoverExpiredPendingOrders(stripe);
    if (deliveryAmount > 0) {
      lines.push({
        productId: "delivery",
        variationId: delivery,
        name: delivery === "express" ? "Express delivery" : "Standard delivery",
        description: delivery === "express" ? "1–2 working days" : "2–4 working days",
        unitAmount: delivery === "express" ? EXPRESS_DELIVERY_AMOUNT : deliveryAmount,
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
      ...(pricing ? {
        discounts: [{
          coupon: (await stripe.coupons.create({
            ...(pricing.coupon.discountType === "percentage"
              ? { percent_off: pricing.coupon.discountValue }
              : { amount_off: pricing.discountAmount, currency: "gbp" }),
            duration: "once",
            name: pricing.coupon.code,
            metadata: {
              glam_too_coupon_id: String(pricing.coupon.id),
              glam_too_coupon_code: pricing.coupon.code,
            },
          })).id,
        }],
      } : {}),
      customer_email: email,
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["GB"] },
      success_url: `${origin}/order-confirmation?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout`,
      metadata: {
        store: "Glam Too",
        glam_too_order_id: order.id,
        customer_name: customerName,
        delivery,
        clerk_user_id: userId,
        vat_rate_percent: String(VAT_RATE_PERCENT),
        vat_amount: String(vatAmount),
         ...couponMetadata(pricing),
      },
    });

    if (!session.url) {
      await attachOrderPayment(order.id, session.id, "checkout_session").catch(() => undefined);
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      await cancelPendingOrder(order.id, session.id).catch(() => undefined);
      throw new Error("Stripe did not return a Checkout URL.");
    }
    try {
      await attachOrderPayment(order.id, session.id, "checkout_session");
      await setOrderExpiration(order.id, new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60) * 1000));
      await reserveInventory(inventoryLines.filter((line): line is CheckoutLine & { inventoryKey: string } => Boolean(line.inventoryKey)), session.id);
      if (pricing) {
        await reserveCouponRedemption(
          pricing.coupon,
          session.id,
          userId,
          new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + 30 * 60) * 1000),
        );
      }
    } catch (error) {
      if (session.status === "open") {
        await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
      }
      await cancelPendingOrder(order.id, session.id).catch(() => undefined);
      throw error;
    }

    return response.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Stripe checkout.";
    return response.status(checkoutErrorStatus(error)).json({ error: message });
  }
});

router.post("/stripe/coupon/validate", async (request, response) => {
  try {
    const submittedLines: SubmittedCheckoutLine[] = Array.isArray(request.body?.lines)
      ? (request.body.lines as unknown[])
        .map(parseCheckoutLine)
        .filter((line: SubmittedCheckoutLine | null): line is SubmittedCheckoutLine => line !== null)
      : [];
    const checkoutLines = await Promise.all(submittedLines.map(resolveCheckoutLine));
    if (submittedLines.length === 0 || checkoutLines.some((line) => line === null)) {
      return response.status(400).json({ error: "Your bag is empty or contains an invalid item." });
    }
    const subtotal = (checkoutLines as CheckoutLine[]).reduce((total, line) => total + line.unitAmount * line.quantity, 0);
    const delivery = request.body?.delivery === "express" ? "express" : "standard";
    const deliveryAmount = calculateDeliveryAmount(delivery, subtotal);
    const pricing = await calculateCouponPricing(request.body?.code, subtotal, deliveryAmount);
    return response.set("Cache-Control", "no-store").json({
      coupon: {
        code: pricing.coupon.code,
        discountType: pricing.coupon.discountType,
        discountValue: pricing.coupon.discountValue,
      },
      subtotal: pricing.subtotal,
      deliveryAmount: pricing.deliveryAmount,
      discountAmount: pricing.discountAmount,
      total: pricing.total,
      vatAmount: pricing.vatAmount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "That coupon could not be applied.";
    return response.status(checkoutErrorStatus(error)).json({ error: message });
  }
});

router.post("/stripe/finalize-payment", async (request, response) => {
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to finalise this order." });
  const paymentIntentId = safeText(request.body?.paymentIntentId, 120);
  const checkoutSessionId = safeText(request.body?.checkoutSessionId, 120);
  if ((!paymentIntentId && !checkoutSessionId) || (paymentIntentId && checkoutSessionId)
    || (paymentIntentId && !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId))
    || (checkoutSessionId && !/^cs_[A-Za-z0-9_]+$/.test(checkoutSessionId))) {
    return response.status(400).json({ error: "Choose a valid Stripe payment." });
  }

  try {
    const stripe = await getUncachableStripeClient();
    const payment = paymentIntentId
      ? await stripe.paymentIntents.retrieve(paymentIntentId)
      : await stripe.checkout.sessions.retrieve(checkoutSessionId);
    const metadata = payment.metadata ?? {};
    const paid = paymentIntentId
      ? (payment as Stripe.PaymentIntent).status === "succeeded"
      : (payment as Stripe.Checkout.Session).payment_status === "paid";
    if (!paid || metadata.store !== "Glam Too" || metadata.clerk_user_id !== userId) {
      return response.status(400).json({ error: "This payment is not ready to finalise." });
    }
    const orderId = safeText(metadata.glam_too_order_id, 80);
    if (!orderId) {
      return response.status(409).json({ error: "This payment was created before reliable order records were enabled. It is being reconciled into your order history." });
    }
    const order = await finalizePaidOrder(
      orderId,
      paymentIntentId || checkoutSessionId,
      paymentDetails(payment, Boolean(paymentIntentId)),
    );
    const resolvedOrder = order
      ? await attemptPaymentRefund(stripe, orderId, order, payment, Boolean(paymentIntentId))
      : order;
    return response.json({ finalised: true, order: resolvedOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The order could not be finalised.";
    request.log?.error({ error }, "Stripe payment finalisation failed");
    return response.status(checkoutErrorStatus(error)).json({ error: message });
  }
});

router.post("/stripe/abandon-payment", async (request, response) => {
  const { userId } = getAuth(request);
  const paymentIntentId = safeText(request.body?.paymentIntentId, 120);
  if (!userId) return response.status(401).json({ error: "Sign in to manage this payment." });
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
    return response.status(400).json({ error: "Choose a valid Stripe payment." });
  }

  try {
    const stripe = await getUncachableStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      paymentIntent.metadata.store !== "Glam Too"
      || paymentIntent.metadata.clerk_user_id !== userId
    ) {
      return response.status(400).json({ error: "This payment cannot be cancelled." });
    }
    if (paymentIntent.status === "succeeded") {
      return response.status(409).json({ paymentSucceeded: true });
    }
    await stripe.paymentIntents.cancel(paymentIntentId);
    const result = await cancelPendingOrder(
      safeText(paymentIntent.metadata.glam_too_order_id, 80) || undefined,
      paymentIntentId,
    );
    return response.json({ abandoned: result.cancelled });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This payment could not be cancelled.";
    request.log?.error({ error }, "Stripe payment abandonment failed");
    return response.status(checkoutErrorStatus(error)).json({ error: message });
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

type ReconciliationDependencies = {
  getState: typeof getReconciliationState;
  saveState: typeof saveReconciliationState;
  queryCheckoutSessions: (query: ReturnType<typeof orderQuery>) => Promise<{ rows: OrderRow[] }>;
  getStripe: typeof getUncachableStripeClient;
  getFulfillmentStatuses: (paymentReferences: string[]) => Promise<{ rows: Array<{ stripe_session_id: string; status: FulfillmentStatus }> }>;
  importLegacyPaidOrder: typeof importLegacyPaidOrder;
};

type CheckoutSessionCursor = {
  created: number | null;
  id: string;
};

function orderQuery(
  userId?: string,
  stripeSessionId?: string,
  limit = 50,
  offset = 0,
  cursor: CheckoutSessionCursor | null = null,
) {
  const values: Array<string | number> = [];
  const ownerFilter = userId
    ? `AND sessions.metadata ->> 'clerk_user_id' = $${values.push(userId)}`
    : "";
  const sessionFilter = stripeSessionId
    ? `AND sessions.id = $${values.push(stripeSessionId)}`
    : "";
  const cursorFilter = cursor?.created === null
    ? `AND sessions.created IS NULL AND sessions.id < $${values.push(cursor.id)}`
    : cursor
      ? `AND (
        sessions.created < $${values.push(cursor.created)}
        OR (sessions.created = $${values.push(cursor.created)} AND sessions.id < $${values.push(cursor.id)})
        OR sessions.created IS NULL
      )`
      : "";
  const limitParameter = values.push(limit);
  const offsetParameter = cursor ? null : values.push(offset);
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
        AND sessions.metadata ->> 'store' = 'Glam Too'
        ${ownerFilter}
        ${sessionFilter}
        ${cursorFilter}
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
      ORDER BY sessions.created DESC NULLS LAST, sessions.id DESC
       LIMIT $${limitParameter}${offsetParameter ? ` OFFSET $${offsetParameter}` : ""}`,
    values,
  };
}

function checkoutSessionCursor(value: string | null): CheckoutSessionCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const id = typeof parsed.id === "string" ? parsed.id : "";
    if (parsed.created === null && id) return { created: null, id };
    const created = Number(parsed.created);
    return Number.isFinite(created) && id ? { created, id } : null;
  } catch {
    return null;
  }
}

function serializeCheckoutSessionCursor(order: OrderRow | undefined) {
  return order && (typeof order.created === "number" || order.created === null)
    ? JSON.stringify({ created: order.created, id: order.id })
    : null;
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
    couponCode: stringValue(metadata.coupon_code, 40) || null,
    discountAmount: Number(metadata.coupon_discount) || 0,
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
    couponCode: stringValue(metadata.coupon_code, 40) || null,
    discountAmount: Number(metadata.coupon_discount) || 0,
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
  const matching: Stripe.PaymentIntent[] = [];
  let startingAfter: string | undefined;
  do {
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    matching.push(...paymentIntents.data.filter((paymentIntent) =>
      paymentIntent.status === "succeeded"
      && paymentIntent.metadata.store === "Glam Too"
      && (!userId || paymentIntent.metadata.clerk_user_id === userId)
      && (!paymentIntentId || paymentIntent.id === paymentIntentId),
    ));
    startingAfter = paymentIntents.has_more ? paymentIntents.data.at(-1)?.id : undefined;
  } while (startingAfter);
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

function legacyOrderInput(
  order: SerializedOrder,
  userId: string,
  paymentReference: string,
  paymentType: "payment_intent" | "checkout_session",
  placedAt: Date,
  couponId?: number,
): PendingOrderInput & {
  id: string;
  paymentReference: string;
  paymentType: "payment_intent" | "checkout_session";
  placedAt: Date;
  fulfillmentStatus: FulfillmentStatus;
} {
  const deliveryAmount = order.delivery.method === "Express delivery" ? 695 : 0;
  return {
    id: `legacy_${paymentReference}`,
    paymentReference,
    paymentType,
    placedAt,
    fulfillmentStatus: order.status,
    userId,
    email: order.email,
    customerName: order.delivery.name,
    phone: "",
    address: order.delivery.address,
    delivery: deliveryAmount ? "express" : "standard",
    subtotal: Math.max(0, order.total + (order.discountAmount ?? 0) - deliveryAmount),
    deliveryAmount,
    discountAmount: order.discountAmount ?? 0,
    total: order.total,
    vatAmount: calculateIncludedVat(order.total),
    coupon: couponId && order.couponCode ? { id: couponId, code: order.couponCode } : undefined,
    expiresAt: placedAt,
    items: order.items.map((item) => ({
      productId: item.productId ?? "legacy-item",
      name: item.name,
      quantity: item.quantity,
      unitAmount: Math.round(item.total / item.quantity),
      total: item.total,
    })),
  };
}

export async function reconcileLegacyOrders(dependencies: ReconciliationDependencies = {
  getState: getReconciliationState,
  saveState: saveReconciliationState,
  queryCheckoutSessions: (query) => pool.query<OrderRow>(query.text, query.values),
  getStripe: getUncachableStripeClient,
  getFulfillmentStatuses: (paymentReferences) => pool.query<{ stripe_session_id: string; status: FulfillmentStatus }>(
    "SELECT stripe_session_id, status FROM order_fulfillment WHERE stripe_session_id = ANY($1)",
    [paymentReferences],
  ),
  importLegacyPaidOrder,
}) {
  const sessionState = await dependencies.getState("checkout_sessions");
  if (!sessionState.completed) {
    const cursor = checkoutSessionCursor(sessionState.cursor);
    const query = orderQuery(undefined, undefined, 50, cursor ? 0 : Number(sessionState.cursor) || 0, cursor);
    const legacySessions = await dependencies.queryCheckoutSessions(query);
    for (const session of legacySessions.rows) {
      const metadata = asRecord(session.metadata);
      const ownerId = stringValue(metadata.clerk_user_id, 120);
      if (!ownerId || safeText(metadata.glam_too_order_id, 80)) continue;
      const couponId = Number(metadata.coupon_id);
      await dependencies.importLegacyPaidOrder(legacyOrderInput(
        serializeOrder(session),
        ownerId,
        session.id,
        "checkout_session",
        new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000),
        Number.isInteger(couponId) && couponId > 0 ? couponId : undefined,
      ));
    }
    await dependencies.saveState(
      "checkout_sessions",
      serializeCheckoutSessionCursor(legacySessions.rows.at(-1)) ?? sessionState.cursor,
      legacySessions.rows.length < 50,
    );
  }

  const paymentIntentState = await dependencies.getState("payment_intents");
  if (paymentIntentState.completed) return;
  const stripe = await dependencies.getStripe();
  const paymentIntents = await stripe.paymentIntents.list({
    limit: 100,
    ...(paymentIntentState.cursor ? { starting_after: paymentIntentState.cursor } : {}),
  });
  const legacyPaymentIntents = paymentIntents.data.filter((paymentIntent) =>
    paymentIntent.status === "succeeded"
    && paymentIntent.metadata.store === "Glam Too"
    && !paymentIntent.metadata.glam_too_order_id
  );
  if (legacyPaymentIntents.length) {
    const statuses = await dependencies.getFulfillmentStatuses(legacyPaymentIntents.map((paymentIntent) => paymentIntent.id));
    const statusByPayment = new Map(statuses.rows.map((status) => [status.stripe_session_id, status.status]));
    for (const paymentIntent of legacyPaymentIntents) {
      const ownerId = paymentIntent.metadata.clerk_user_id;
      if (!ownerId) continue;
      const couponId = Number(paymentIntent.metadata.coupon_id);
      await dependencies.importLegacyPaidOrder(legacyOrderInput(
        serializePaymentIntentOrder(paymentIntent, statusByPayment.get(paymentIntent.id) ?? "Processing"),
        ownerId,
        paymentIntent.id,
        "payment_intent",
        new Date(paymentIntent.created * 1000),
        Number.isInteger(couponId) && couponId > 0 ? couponId : undefined,
      ));
    }
  }
  await dependencies.saveState(
    "payment_intents",
    paymentIntents.data.at(-1)?.id ?? paymentIntentState.cursor,
    !paymentIntents.has_more,
  );
}

async function allOrders(userId?: string) {
  await reconcileLegacyOrders().catch(() => undefined);
  return listPaidOrders(userId);
}

async function getOrderBySessionId(stripeSessionId: string) {
  return getPaidOrderByPaymentReference(stripeSessionId);
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
    const existingOrder = await getOrderBySessionId(stripeSessionId);
    if (!existingOrder) return response.status(404).json({ error: "That paid order could not be found." });

    const updatedOrder = await updateOrderFulfillment(stripeSessionId, status);
    if (!updatedOrder) return response.status(404).json({ error: "That order could not be reloaded." });
    return response.json({ order: updatedOrder });
  } catch (error) {
    request.log?.error({ error, stripeSessionId }, "Order status could not be updated");
    return response.status(503).json({ error: "Order status could not be updated right now." });
  }
});

router.post("/admin/orders/:stripeSessionId/payment-resolution", requireAdmin, async (request, response) => {
  const paymentReference = safeText(request.params.stripeSessionId, 120);
  const action = safeText(request.body?.action, 40);
  const isPaymentIntent = /^pi_[A-Za-z0-9_]+$/.test(paymentReference);
  if ((!isPaymentIntent && !/^cs_[A-Za-z0-9_]+$/.test(paymentReference))
    || !["retry_refund", "mark_manual_resolution"].includes(action)) {
    return response.status(400).json({ error: "Choose a valid payment-resolution action." });
  }

  try {
    if (action === "mark_manual_resolution") {
      const order = await recordPaymentResolutionByPaymentReference(paymentReference, "manual_resolution");
      if (!order) return response.status(409).json({ error: "That order does not need a manual payment resolution." });
      return response.json({ order });
    }

    const orderId = await getOrderIdByPaymentReference(paymentReference);
    const order = await getPaidOrderByPaymentReference(paymentReference);
    if (!orderId || !order || !["refund_pending", "refund_processing"].includes(order.paymentResolution)) {
      return response.status(409).json({ error: "That order does not have a refund waiting to be processed." });
    }
    const stripe = await getUncachableStripeClient();
    const payment = isPaymentIntent
      ? await stripe.paymentIntents.retrieve(paymentReference)
      : await stripe.checkout.sessions.retrieve(paymentReference);
    const resolvedOrder = await attemptPaymentRefund(stripe, orderId, order, payment, isPaymentIntent);
    return response.json({ order: resolvedOrder });
  } catch (error) {
    request.log?.error({ error, paymentReference }, "Order payment resolution failed");
    return response.status(503).json({ error: "The payment resolution could not be updated right now." });
  }
});

export default router;