import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { contactEnquiriesTable, couponsTable, customerProfilesTable, db, returnInformationTable, shippingMethodsTable, sizeGuideTable } from "@workspace/db";
import { listDeliveryInformation, serializeDeliveryInformation } from "../deliveryInformation";
import { listSizeGuide, serializeSizeGuideRow } from "../sizeGuide";
import { getReturnInformation } from "../returnInformation";
import { listShippingMethods, serializeShippingMethod } from "../shippingMethods";
import { getAdminAccess, isAdminUser, isBootstrapAdminUser, requireAdmin } from "../adminAuth";
import {
  CouponValidationError,
  getCouponById,
  updateCouponWithUsageLimit,
  validateCouponInput,
} from "../couponService";

const router: IRouter = Router();

router.get("/admin/shipping-methods", requireAdmin, async (_request, response) => {
  response.set("Cache-Control", "no-store").json({ shippingMethods: (await listShippingMethods()).map(serializeShippingMethod) });
});
router.post("/admin/shipping-methods", requireAdmin, async (request, response) => {
  const name = textValue(request.body?.name, 100);
  const description = textValue(request.body?.description, 2000);
  const price = Math.round(Number(request.body?.price) * 100);
  const rawFree = request.body?.freeOver;
  const freeOver = rawFree === null || rawFree === "" || rawFree === undefined ? null : Math.round(Number(rawFree) * 100);
  if (!name || !Number.isInteger(price) || price < 0 || (freeOver !== null && (!Number.isInteger(freeOver) || freeOver < 0))) return response.status(400).json({ error: "Enter a valid shipping name and non-negative prices." });
  try {
    const [method] = await db.insert(shippingMethodsTable).values({ name, description, price, freeOver, enabled: request.body?.enabled !== false, sortOrder: Number.isInteger(request.body?.sortOrder) ? request.body.sortOrder : 0, deliveryAdviceImported: true }).returning();
    return response.status(201).json({ shippingMethod: serializeShippingMethod(method) });
  } catch { return response.status(409).json({ error: "A shipping method with that name already exists." }); }
});
router.patch("/admin/shipping-methods/:methodId", requireAdmin, async (request, response) => {
  const id = Number(request.params.methodId);
  if (!Number.isInteger(id)) return response.status(400).json({ error: "Choose a valid shipping method." });
  const updates: Record<string, unknown> = {};
  if (request.body?.name !== undefined) {
    const name = textValue(request.body.name, 100);
    if (!name) return response.status(400).json({ error: "Shipping method name cannot be empty." });
    updates.name = name;
  }
  if (request.body?.description !== undefined) updates.description = textValue(request.body.description, 2000);
  if (request.body?.price !== undefined) {
    const price = Number(request.body.price);
    if (!Number.isFinite(price) || price < 0) return response.status(400).json({ error: "Shipping price must be a non-negative number." });
    updates.price = Math.round(price * 100);
  }
  if (request.body?.freeOver !== undefined) {
    if (request.body.freeOver === null || request.body.freeOver === "") updates.freeOver = null;
    else {
      const freeOver = Number(request.body.freeOver);
      if (!Number.isFinite(freeOver) || freeOver < 0) return response.status(400).json({ error: "Free-over threshold must be a non-negative number." });
      updates.freeOver = Math.round(freeOver * 100);
    }
  }
  if (typeof request.body?.enabled === "boolean") updates.enabled = request.body.enabled;
  if (Number.isInteger(request.body?.sortOrder)) updates.sortOrder = request.body.sortOrder;
  try {
    await listShippingMethods();
    const [method] = await db.update(shippingMethodsTable).set(updates).where(eq(shippingMethodsTable.id, id)).returning();
    return method ? response.json({ shippingMethod: serializeShippingMethod(method) }) : response.status(404).json({ error: "Shipping method not found." });
  } catch { return response.status(409).json({ error: "Shipping method could not be updated." }); }
});
router.delete("/admin/shipping-methods/:methodId", requireAdmin, async (request, response) => {
  const id = Number(request.params.methodId);
  if (!Number.isInteger(id)) return response.status(400).json({ error: "Choose a valid shipping method." });
  await db.delete(shippingMethodsTable).where(eq(shippingMethodsTable.id, id));
  return response.status(204).send();
});

router.get("/admin/delivery-information", requireAdmin, async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json({
      deliveryInformation: (await listDeliveryInformation()).map(serializeDeliveryInformation),
    });
  } catch (error) {
    request.log?.error({ error }, "Delivery information could not be loaded");
    return response.status(503).json({ error: "Delivery information could not be loaded right now." });
  }
});

router.put("/admin/delivery-information", requireAdmin, async (request, response) => {
  return response.status(409).json({ error: "Delivery rates and promises are now managed under Shipping, which updates both product pages and checkout." });
});

router.get("/admin/return-information", requireAdmin, async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json(await getReturnInformation());
  } catch (error) {
    request.log?.error({ error }, "Return information could not be loaded");
    return response.status(503).json({ error: "Return information could not be loaded right now." });
  }
});

router.put("/admin/return-information", requireAdmin, async (request, response) => {
  const content = textValue(request.body?.content, 50000);
  try {
    await db
      .insert(returnInformationTable)
      .values({ id: 1, content })
      .onConflictDoUpdate({
        target: returnInformationTable.id,
        set: { content, updatedAt: new Date() },
      });
    return response.json(await getReturnInformation());
  } catch (error) {
    request.log?.error({ error }, "Return information could not be saved");
    return response.status(503).json({ error: "Return information could not be saved right now." });
  }
});

router.get("/admin/size-guide", requireAdmin, async (request, response) => {
  try {
    return response.set("Cache-Control", "no-store").json({
      sizeGuide: (await listSizeGuide()).map(serializeSizeGuideRow),
    });
  } catch (error) {
    request.log?.error({ error }, "Size guide could not be loaded");
    return response.status(503).json({ error: "Size guide could not be loaded right now." });
  }
});

router.put("/admin/size-guide", requireAdmin, async (request, response) => {
  const rows = Array.isArray(request.body?.sizeGuide) ? request.body.sizeGuide : null;
  if (!rows || rows.length > 100) {
    return response.status(400).json({ error: "Add no more than 100 size guide rows." });
  }

  const parsedRows: Array<{ id: number | null; size: string; ukSize: string; bust: string; waist: string; hips: string; sortOrder: number }> = rows.map((value: unknown, index: number) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const id = Number(row.id);
    return {
      id: Number.isInteger(id) && id > 0 ? id : null,
      size: textValue(row.size, 30),
      ukSize: textValue(row.ukSize, 30),
      bust: textValue(row.bust, 100),
      waist: textValue(row.waist, 100),
      hips: textValue(row.hips, 100),
      sortOrder: index,
    };
  });

  if (parsedRows.some((row) => !row.size || !row.ukSize || !row.bust || !row.waist || !row.hips)) {
    return response.status(400).json({ error: "Every size guide row needs a size, UK size, bust, waist, and hips value." });
  }
  const existingIds = parsedRows.flatMap((row) => row.id === null ? [] : [row.id]);
  if (new Set(existingIds).size !== existingIds.length) {
    return response.status(400).json({ error: "Size guide rows contain duplicate identifiers." });
  }

  try {
    await db.transaction(async (transaction) => {
      const currentRows = await transaction.select({ id: sizeGuideTable.id }).from(sizeGuideTable).orderBy(asc(sizeGuideTable.id));
      const currentIds = new Set(currentRows.map((row) => row.id));
      if (existingIds.some((id) => !currentIds.has(id))) throw new Error("Size guide row not found.");

      const removedIds = currentRows.map((row) => row.id).filter((id) => !existingIds.includes(id));
      if (removedIds.length > 0) {
        await transaction.delete(sizeGuideTable).where(inArray(sizeGuideTable.id, removedIds));
      }
      for (const row of parsedRows) {
        if (row.id === null) {
          await transaction.insert(sizeGuideTable).values({
            size: row.size,
            ukSize: row.ukSize,
            bust: row.bust,
            waist: row.waist,
            hips: row.hips,
            sortOrder: row.sortOrder,
          });
        } else {
          await transaction.update(sizeGuideTable).set({
            size: row.size,
            ukSize: row.ukSize,
            bust: row.bust,
            waist: row.waist,
            hips: row.hips,
            sortOrder: row.sortOrder,
          }).where(eq(sizeGuideTable.id, row.id));
        }
      }
    });
    return response.json({ sizeGuide: (await listSizeGuide()).map(serializeSizeGuideRow) });
  } catch (error) {
    request.log?.error({ error }, "Size guide could not be saved");
    return response.status(503).json({ error: "Size guide could not be saved right now." });
  }
});

router.get("/admin/contact-enquiries", requireAdmin, async (request, response): Promise<void> => {
  try {
    const enquiries = await db
      .select()
      .from(contactEnquiriesTable)
      .orderBy(desc(contactEnquiriesTable.createdAt));
    response.set("Cache-Control", "no-store").json({
      enquiries: enquiries.map((enquiry) => ({
        ...enquiry,
        createdAt: enquiry.createdAt.toISOString(),
        deliveredAt: enquiry.deliveredAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    request.log?.error({ error }, "Admin contact enquiry list failed");
    response.status(503).json({ error: "Customer messages could not be loaded right now." });
  }
});

router.get("/admin/access", async (request, response) => {
  try {
    const access = await getAdminAccess(request);
    if (!access.authenticated) {
      return response.status(401).json(access);
    }
    if (!access.authorized) {
      return response.status(403).json(access);
    }
    return response.set("Cache-Control", "no-store").json(access);
  } catch (error) {
    request.log?.error({ error }, "Admin access endpoint failed");
    return response.status(503).json({ authenticated: true, authorized: false, error: "Admin access could not be verified right now." });
  }
});

function serializeUser(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  primaryEmailAddressId: string | null;
  createdAt: number;
  lastSignInAt: number | null;
  privateMetadata?: Record<string, unknown>;
}, profile?: { firstName: string; lastName: string }) {
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? "";
  return {
    id: user.id,
    firstName: profile?.firstName || user.firstName || "",
    lastName: profile?.lastName || user.lastName || "",
    name: [profile?.firstName || user.firstName, profile?.lastName || user.lastName].filter(Boolean).join(" ") || "Unnamed customer",
    email: primaryEmail,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    isAdmin: isAdminUser(user),
    isBootstrapAdmin: isBootstrapAdminUser(user),
  };
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function splitName(firstName: string, lastName: string) {
  return {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
  };
}

router.get("/admin/users", requireAdmin, async (request, response) => {
  try {
    const users = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const page = await clerkClient.users.getUserList({ limit, offset, orderBy: "-created_at" });
      users.push(...page.data);
      if (users.length >= page.totalCount || page.data.length === 0) break;
      offset += page.data.length;
    }
    const profiles = await db.select({
      userId: customerProfilesTable.userId,
      firstName: customerProfilesTable.firstName,
      lastName: customerProfilesTable.lastName,
    }).from(customerProfilesTable);
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return response.set("Cache-Control", "no-store").json({
      users: users.map((user) => serializeUser(user, profileByUserId.get(user.id))),
    });
  } catch (error) {
    request.log?.error({ error }, "Admin user list failed");
    return response.status(503).json({ error: "User accounts could not be loaded right now." });
  }
});

router.post("/admin/users", requireAdmin, async (request, response) => {
  const firstName = textValue(request.body?.firstName, 80);
  const lastName = textValue(request.body?.lastName, 80);
  const email = textValue(request.body?.email, 250).toLowerCase();
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const role = request.body?.role;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < 8 || password.length > 72) {
    return response.status(400).json({ error: "Password must be between 8 and 72 characters." });
  }
  if (role !== "customer" && role !== "admin") {
    return response.status(400).json({ error: "Choose either Customer or Admin as the user role." });
  }

  try {
    const created = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      ...splitName(firstName, lastName),
      privateMetadata: { role: role === "admin" ? "admin" : null },
    });
    return response.status(201).json({ user: serializeUser(created) });
  } catch (error) {
    request.log?.error({ error }, "Admin user creation failed");
    return response.status(400).json({ error: "This user could not be created. The email may already be in use or the password may not meet Clerk's requirements." });
  }
});

router.patch("/admin/users/:userId", requireAdmin, async (request, response) => {
  const routeUserId = request.params.userId;
  const userId = Array.isArray(routeUserId) ? routeUserId[0] : routeUserId;
  const firstName = textValue(request.body?.firstName, 80);
  const lastName = textValue(request.body?.lastName, 80);
  const email = textValue(request.body?.email, 250).toLowerCase();
  if (!/^user_[a-zA-Z0-9]+$/.test(userId)) {
    return response.status(400).json({ error: "Choose a valid user account." });
  }
  if (!firstName && !lastName) {
    return response.status(400).json({ error: "Enter a first or last name." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    const target = await clerkClient.users.getUser(userId);
    const currentPrimary = target.emailAddresses.find((item) => item.id === target.primaryEmailAddressId)
      ?? target.emailAddresses[0];
    const emailChanged = currentPrimary?.emailAddress.toLowerCase() !== email;
    if (emailChanged && isBootstrapAdminUser(target)) {
      return response.status(400).json({ error: "The primary owner email is protected. You can still update their name." });
    }

    if (emailChanged) {
      const createdEmail = await clerkClient.emailAddresses.createEmailAddress({
        userId,
        emailAddress: email,
        verified: true,
        primary: true,
      });
      await clerkClient.users.updateUser(userId, {
        primaryEmailAddressID: createdEmail.id,
        notifyPrimaryEmailAddressChanged: true,
      });
      if (currentPrimary && currentPrimary.id !== createdEmail.id) {
        await clerkClient.emailAddresses.deleteEmailAddress(currentPrimary.id);
      }
    }

    await clerkClient.users.updateUser(userId, { firstName, lastName });
    const updatedAt = new Date();
    await db.insert(customerProfilesTable).values({ userId, firstName, lastName, updatedAt }).onConflictDoUpdate({
      target: customerProfilesTable.userId,
      set: { firstName, lastName, updatedAt },
    });
    const updated = await clerkClient.users.getUser(userId);
    return response.json({ user: serializeUser(updated, { firstName, lastName }) });
  } catch (error) {
    request.log?.error({ error, userId }, "Admin user profile update failed");
    return response.status(400).json({ error: "This user could not be updated. The email may already be in use." });
  }
});

router.patch("/admin/users/:userId/access", requireAdmin, async (request, response) => {
  const routeUserId = request.params.userId;
  const userId = Array.isArray(routeUserId) ? routeUserId[0] : routeUserId;
  const isAdmin = request.body?.isAdmin;
  if (typeof isAdmin !== "boolean" || !/^user_[a-zA-Z0-9]+$/.test(userId)) {
    return response.status(400).json({ error: "Choose a valid user and access level." });
  }

  try {
    const access = await getAdminAccess(request);
    const target = await clerkClient.users.getUser(userId);
    const targetIsBootstrap = isAdminUser(target);
    if (!isAdmin && targetIsBootstrap) {
      const targetEmails = target.emailAddresses.map((email) => email.emailAddress.toLowerCase());
      const bootstrapEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
      if (targetEmails.some((email) => bootstrapEmails.includes(email))) {
        return response.status(400).json({ error: "The bootstrap admin cannot be removed from the allowlist." });
      }
    }
    if (userId === access.userId && !isAdmin && access.isBootstrapAdmin) {
      return response.status(400).json({ error: "The bootstrap admin cannot remove their own access." });
    }

    const updated = await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { role: isAdmin ? "admin" : null },
    });
    return response.json({ user: serializeUser(updated) });
  } catch (error) {
    request.log?.error({ error, userId }, "Admin user access update failed");
    return response.status(503).json({ error: "Admin access could not be updated right now." });
  }
});

router.delete("/admin/users/:userId", requireAdmin, async (request, response) => {
  const routeUserId = request.params.userId;
  const userId = Array.isArray(routeUserId) ? routeUserId[0] : routeUserId;
  if (!/^user_[a-zA-Z0-9]+$/.test(userId)) {
    return response.status(400).json({ error: "Choose a valid user account." });
  }

  try {
    const access = await getAdminAccess(request);
    const target = await clerkClient.users.getUser(userId);
    if (isAdminUser(target) && isBootstrapAdminUser(target)) {
      return response.status(400).json({ error: "The primary owner account cannot be deleted." });
    }
    if (userId === access.userId) {
      return response.status(400).json({ error: "You cannot delete the account you are currently using." });
    }

    await clerkClient.users.deleteUser(userId);
    return response.json({ deletedUserId: userId });
  } catch (error) {
    request.log?.error({ error, userId }, "Admin user deletion failed");
    return response.status(503).json({ error: "This user could not be deleted right now." });
  }
});

function serializeCoupon(coupon: typeof couponsTable.$inferSelect) {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    active: coupon.active,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    minimumSpend: coupon.minimumSpend,
    usageLimit: coupon.usageLimit,
    usageCount: coupon.usageCount,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

function couponId(value: string | string[]) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function couponError(error: unknown) {
  if (error instanceof CouponValidationError) return error;
  return null;
}

router.get("/admin/coupons", requireAdmin, async (request, response) => {
  try {
    const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    return response.set("Cache-Control", "no-store").json({ coupons: coupons.map(serializeCoupon) });
  } catch (error) {
    request.log?.error({ error }, "Admin coupon list failed");
    return response.status(503).json({ error: "Coupons could not be loaded right now." });
  }
});

router.post("/admin/coupons", requireAdmin, async (request, response) => {
  try {
    const input = validateCouponInput(request.body ?? {});
    if (
      input.code === undefined
      || input.discountType === undefined
      || input.discountValue === undefined
      || input.discountValue === null
    ) {
      throw new CouponValidationError("Complete the coupon code and discount details.");
    }
    const [coupon] = await db.insert(couponsTable).values({
      code: input.code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      active: input.active ?? true,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      minimumSpend: input.minimumSpend ?? 0,
      usageLimit: input.usageLimit ?? null,
    }).returning();
    return response.status(201).json({ coupon: serializeCoupon(coupon) });
  } catch (error) {
    const validationError = couponError(error);
    if (validationError) return response.status(validationError.statusCode).json({ error: validationError.message });
    if (error instanceof Error && error.message.toLowerCase().includes("duplicate")) {
      return response.status(409).json({ error: "That coupon code already exists." });
    }
    request.log?.error({ error }, "Admin coupon creation failed");
    return response.status(503).json({ error: "This coupon could not be created right now." });
  }
});

router.patch("/admin/coupons/:couponId", requireAdmin, async (request, response) => {
  const id = couponId(request.params.couponId);
  if (!id) return response.status(400).json({ error: "Choose a valid coupon." });

  try {
    const existing = await getCouponById(id);
    if (!existing) return response.status(404).json({ error: "That coupon could not be found." });
    const input = validateCouponInput(request.body ?? {}, true);
    const merged = validateCouponInput({
      code: input.code ?? existing.code,
      discountType: input.discountType ?? existing.discountType,
      discountValue: input.discountValue ?? existing.discountValue,
      startsAt: input.startsAt === undefined ? existing.startsAt : input.startsAt,
      endsAt: input.endsAt === undefined ? existing.endsAt : input.endsAt,
      minimumSpend: input.minimumSpend ?? existing.minimumSpend,
      usageLimit: input.usageLimit === undefined ? existing.usageLimit : input.usageLimit,
      active: input.active ?? existing.active,
    });
    if (
      merged.code === undefined
      || merged.discountType === undefined
      || merged.discountValue === undefined
      || merged.discountValue === null
    ) {
      throw new CouponValidationError("Complete the coupon code and discount details.");
    }
    const updated = await updateCouponWithUsageLimit(id, {
      code: merged.code,
      discountType: merged.discountType,
      discountValue: merged.discountValue,
      startsAt: merged.startsAt ?? null,
      endsAt: merged.endsAt ?? null,
      minimumSpend: merged.minimumSpend ?? 0,
      usageLimit: merged.usageLimit ?? null,
      active: merged.active ?? true,
    });
    if (!updated) return response.status(404).json({ error: "That coupon could not be found." });
    return response.json({ coupon: serializeCoupon(updated) });
  } catch (error) {
    const validationError = couponError(error);
    if (validationError) return response.status(validationError.statusCode).json({ error: validationError.message });
    if (error instanceof Error && error.message.toLowerCase().includes("duplicate")) {
      return response.status(409).json({ error: "That coupon code already exists." });
    }
    request.log?.error({ error, id }, "Admin coupon update failed");
    return response.status(503).json({ error: "This coupon could not be updated right now." });
  }
});

router.delete("/admin/coupons/:couponId", requireAdmin, async (request, response) => {
  const id = couponId(request.params.couponId);
  if (!id) return response.status(400).json({ error: "Choose a valid coupon." });
  try {
    const existing = await getCouponById(id);
    if (!existing) return response.status(404).json({ error: "That coupon could not be found." });
    if (existing.usageCount > 0) {
      return response.status(409).json({ error: "Coupons with recorded redemptions cannot be deleted. Deactivate it instead." });
    }
    await db.delete(couponsTable).where(eq(couponsTable.id, id));
    return response.json({ deletedCouponId: id });
  } catch (error) {
    request.log?.error({ error, id }, "Admin coupon deletion failed");
    return response.status(503).json({ error: "This coupon could not be deleted right now." });
  }
});

export default router;