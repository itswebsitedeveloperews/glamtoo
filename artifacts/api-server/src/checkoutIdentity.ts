import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";

const cookieName = "glam_too_guest_checkout";
const tokenPattern = /^[a-f0-9]{64}$/;

export function guestCheckoutOwner(token: string): string | undefined {
  return tokenPattern.test(token)
    ? `guest_${createHash("sha256").update(token).digest("hex")}`
    : undefined;
}

/** The cookie is the secret; Stripe metadata and order rows contain only its hash. */
export function readGuestCheckoutOwner(request: Request): string | undefined {
  const cookie = (request.headers.cookie ?? "").split(";")
    .map((value) => value.trim()).find((value) => value.startsWith(`${cookieName}=`));
  return guestCheckoutOwner(cookie?.slice(cookieName.length + 1) ?? "");
}

export function createGuestCheckoutOwner(request: Request, response: Response): string {
  const existing = readGuestCheckoutOwner(request);
  if (existing) return existing;
  const token = randomBytes(32).toString("hex");
  response.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || request.secure
      || request.get("x-forwarded-proto")?.split(",")[0].trim() === "https",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return guestCheckoutOwner(token)!;
}

export function ownsCheckoutPayment(
  metadata: Record<string, string>,
  userId: string | null | undefined,
  guestOwner: string | undefined,
): boolean {
  if (metadata.store !== "Glam Too") return false;
  return Boolean(
    (userId && metadata.clerk_user_id === userId)
    || (guestOwner && metadata.guest_checkout_id === guestOwner),
  );
}

export function checkoutOriginAllowed(request: Request): boolean {
  if (request.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.get("origin");
  if (!origin) return true; // Non-browser API calls still require proof of payment ownership.
  try {
    const parsed = new URL(origin);
    const hosts = [request.get("host"), request.get("x-forwarded-host")?.split(",")[0].trim()];
    return ["http:", "https:"].includes(parsed.protocol) && hosts.includes(parsed.host);
  } catch {
    return false;
  }
}
