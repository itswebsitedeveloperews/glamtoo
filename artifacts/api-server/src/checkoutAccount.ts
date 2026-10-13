import { randomBytes } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { pool } from "@workspace/db";

export type CheckoutAccountStatus = "created" | "existing" | "pending";

/**
 * Called only after verified paid-order finalization. Clerk's unique external ID
 * and the row lock make webhook/browser retries safe, including a crash between
 * creating the Clerk user and saving its order/profile.
 */
export async function provisionCheckoutAccount(
  orderId: string,
  guestOwner: string,
  firstName: string,
  lastName: string,
): Promise<CheckoutAccountStatus> {
  if (!/^guest_[a-f0-9]{64}$/.test(guestOwner)) throw new Error("Invalid guest account request");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM store_orders WHERE id = $1 AND payment_status = 'paid' AND payment_resolution = 'none' FOR UPDATE",
      [orderId],
    );
    const order = rows[0];
    if (!order) throw new Error("A completed purchase is required for account creation");
    const externalId = `glam_checkout_${orderId}`;
    const previous = await clerkClient.users.getUserList({ externalId: [externalId], limit: 1 });
    let user = previous.data[0];
    if (user) {
      if (user.privateMetadata.checkoutGuestOwner !== guestOwner
        || !user.emailAddresses.some((email) => email.emailAddress.toLowerCase() === order.email.toLowerCase())
        || (order.user_id !== guestOwner && order.user_id !== user.id)) {
        throw new Error("Account request does not own this purchase");
      }
    } else {
      if (order.user_id !== guestOwner) throw new Error("Account request does not own this purchase");
      const existing = await clerkClient.users.getUserList({ emailAddress: [order.email], limit: 1 });
      if (existing.data.length) {
        // An email supplied in a guest billing form is NOT proof of account ownership.
        await client.query("COMMIT");
        return "existing";
      }
      user = await clerkClient.users.createUser({
        externalId,
        emailAddress: [order.email],
        emailAddressIdentificationStatus: ["reserved"],
        firstName,
        lastName,
        // No password or session is given to the guest browser. The mailbox owner
        // must use the email-code password recovery flow before signing in.
        password: `Aa1!${randomBytes(32).toString("base64url")}`,
        privateMetadata: { role: null, checkoutGuestOwner: guestOwner },
      });
    }
    await client.query(
      `INSERT INTO customer_profiles (user_id,first_name,last_name,phone,address_line_1,address_line_2,city,postcode,country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, firstName, lastName, order.phone, order.address_line_1, order.address_line_2, order.city, order.postcode, order.country],
    );
    await client.query("UPDATE store_orders SET user_id = $2, updated_at = NOW() WHERE id = $1", [orderId, user.id]);
    await client.query("COMMIT");
    return "created";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
