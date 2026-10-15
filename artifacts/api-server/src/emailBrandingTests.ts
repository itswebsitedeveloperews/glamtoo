import { createHash, randomUUID } from "node:crypto";
import { buildOrderConfirmation } from "./orderConfirmationTemplate";
import { buildContactNotificationMessage } from "./contactNotificationEmail";
import { buildRefundNotificationMessage } from "./refundNotificationTemplate";

export const brandingVariants = ["order", "contact", "refund_processing", "refunded", "manual_resolution"] as const;
export type BrandingVariant = typeof brandingVariants[number];
export type SampleStatus = "reserved" | "sending" | "accepted" | "failed" | "uncertain" | "not_sent";
export type BrandingSample = {
  variant: BrandingVariant; marker: string; messageId: string; subject: string; status: SampleStatus;
};
export type BrandingApproval = { recipient: string; key: string };
export function brandingApproval(): BrandingApproval | null {
  const recipient = process.env.EMAIL_BRANDING_TEST_RECIPIENT?.trim().toLowerCase();
  const approval = process.env.EMAIL_BRANDING_TEST_APPROVAL_ID?.trim();
  // Exactly one separately approved recipient. Never consult broad customer-send switches.
  if (!recipient || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(recipient)
    || !approval || !/^[a-zA-Z0-9_-]{16,100}$/.test(approval)) return null;
  return { recipient, key: createHash("sha256").update(JSON.stringify([approval, recipient])).digest("hex") };
}

export function buildBrandingSamples(publicUrl: string, marker = `GT-QA-${randomUUID()}`) {
  const name = `Synthetic test customer (${marker})`;
  const orderId = `synthetic_${marker.replace(/[^a-zA-Z0-9]/g, "")}`;
  const order = buildOrderConfirmation({
    id: orderId, user_id: "guest_synthetic", email: "synthetic@example.invalid", customer_name: name,
    currency: "gbp", subtotal: 6500, discount_amount: 500, delivery_amount: 395, vat_amount: 1066,
    total: 6395, coupon_code: "SYNTHETIC", delivery_method: "Synthetic standard delivery",
    address_line_1: "1 Example Street", address_line_2: "Synthetic address — do not dispatch",
    city: "Example Town", postcode: "TEST ONLY", country: "United Kingdom",
  }, [{ name: "Synthetic floral occasion dress — size M / Rose", quantity: 1, unit_amount: 6500, total: 6500 }], publicUrl);
  const contact = buildContactNotificationMessage({
    id: 0, name, email: "synthetic@example.invalid", orderNumber: "SYNTHETIC-NOT-AN-ORDER",
    topic: `Synthetic branding review ${marker}`,
    message: "This is a synthetic rendering sample, not a customer enquiry.\nPlease check wrapping, the inline wordmark, contrast and the complete footer.\nNo order, payment or refund exists.",
  });
  const messages = [order, contact, ...brandingVariants.slice(2).map(variant =>
    buildRefundNotificationMessage(variant as "refund_processing" | "refunded" | "manual_resolution", orderId, name))];
  return brandingVariants.map((variant, i) => {
    const message = messages[i]!;
    const notice = "SYNTHETIC RENDERING TEST — no order, payment or refund exists.";
    return {
      variant, marker, messageId: `<glam-too-branding-${randomUUID()}@notifications.glamtoo.invalid>`,
      subject: `[SYNTHETIC ${marker}] ${message.subject}`, status: "reserved" as const,
      message: {
        ...message, subject: `[SYNTHETIC ${marker}] ${message.subject}`,
        text: `${notice}\n\n${message.text}`,
        html: message.html.replace(/(<body[^>]*>)/, `$1\n<p style="margin:0;padding:12px;font:16px/24px Arial,sans-serif;background:#ffffff;color:#171615;">${notice}</p>`),
      },
    };
  });
}

export interface BrandingTestStore {
  reserve(approval: BrandingApproval, adminId: string, samples: BrandingSample[]): Promise<boolean>;
  update(key: string, variant: BrandingVariant, status: SampleStatus): Promise<void>;
}
export class BrandingBatchUsed extends Error {}

/** Once reserved, this approval is permanently consumed, even after a crash. */
export async function sendBrandingBatch(
  approval: BrandingApproval, adminId: string, publicUrl: string, store: BrandingTestStore,
  send: (sample: ReturnType<typeof buildBrandingSamples>[number]) => Promise<unknown>,
  classifyFailure: (error: unknown) => "failed" | "uncertain" = () => "uncertain",
) {
  const samples = buildBrandingSamples(publicUrl);
  if (!await store.reserve(approval, adminId, samples)) throw new BrandingBatchUsed("This approval has already been used.");
  let stopped = false;
  for (const sample of samples) {
    if (stopped) { await store.update(approval.key, sample.variant, "not_sent"); continue; }
    // Persist before SMTP. A process interruption leaves a visible frozen sending state.
    await store.update(approval.key, sample.variant, "sending");
    try { await send(sample); }
    catch (error) {
      stopped = true;
      await store.update(approval.key, sample.variant, classifyFailure(error));
      continue;
    }
    // A failed acceptance write must abort, never turn acceptance into a retry.
    await store.update(approval.key, sample.variant, "accepted");
  }
}
