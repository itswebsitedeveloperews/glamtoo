import { clerkClient, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { customerProfilesTable, productInventoryTable, wishlistsTable } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { getInventoryLevels } from "../inventoryService";

const router: IRouter = Router();

function safeText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

async function getAuthenticatedUserId(request: Parameters<typeof getAuth>[0]) {
  const { userId } = getAuth(request);
  return userId || null;
}

function parseProductId(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const productId = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return Number.isInteger(productId) && productId > 0 && productId <= 1_000_000_000 ? productId : null;
}

function parseProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(parseProductId).filter((productId): productId is number => productId !== null))].slice(0, 100);
}

async function getActiveWishlistProductIds(productIds: number[]) {
  const requestedIds = uniqueProductIds(productIds);
  if (!requestedIds.length) return new Set<number>();
  await getInventoryLevels();
  const rows = await db
    .select({ catalogProductId: productInventoryTable.catalogProductId })
    .from(productInventoryTable)
    .where(and(
      eq(productInventoryTable.active, true),
      inArray(productInventoryTable.catalogProductId, requestedIds.map(String)),
    ));
  return new Set(rows
    .map(({ catalogProductId }) => Number(catalogProductId))
    .filter((productId) => Number.isInteger(productId) && productId > 0));
}

function uniqueProductIds(productIds: number[]) {
  return [...new Set(productIds)];
}

async function getWishlistProductIds(userId: string) {
  const rows = await db
    .select({ productId: wishlistsTable.productId })
    .from(wishlistsTable)
    .where(eq(wishlistsTable.userId, userId))
    .orderBy(desc(wishlistsTable.createdAt), desc(wishlistsTable.id));
  const validProductIds = await getActiveWishlistProductIds(rows.map(({ productId }) => productId));
  const staleProductIds = rows
    .map(({ productId }) => productId)
    .filter((productId) => !validProductIds.has(productId));
  if (staleProductIds.length) {
    await db.delete(wishlistsTable).where(and(
      eq(wishlistsTable.userId, userId),
      inArray(wishlistsTable.productId, uniqueProductIds(staleProductIds)),
    ));
  }
  return rows.map(({ productId }) => productId).filter((productId) => validProductIds.has(productId));
}

router.get("/account/wishlist", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to view your wishlist." });

  try {
    return response.set("Cache-Control", "no-store").json({ productIds: await getWishlistProductIds(userId) });
  } catch (error) {
    request.log?.error({ error }, "Wishlist could not be loaded");
    return response.status(503).json({ error: "Your wishlist could not be loaded right now." });
  }
});

router.get("/account/wishlist/:productId", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to check your wishlist." });
  const productId = parseProductId(request.params.productId);
  if (productId === null) return response.status(400).json({ error: "Choose a valid product." });

  try {
    return response.json({ saved: (await getWishlistProductIds(userId)).includes(productId) });
  } catch (error) {
    request.log?.error({ error, productId }, "Wishlist item could not be checked");
    return response.status(503).json({ error: "This wishlist item could not be checked right now." });
  }
});

router.post("/account/wishlist", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to save products to your wishlist." });
  const productId = parseProductId(request.body?.productId);
  if (productId === null) return response.status(400).json({ error: "Choose a valid product." });

  try {
    if (!(await getActiveWishlistProductIds([productId])).has(productId)) {
      return response.status(404).json({ error: "This product is no longer available." });
    }
    await db.insert(wishlistsTable).values({ userId, productId }).onConflictDoNothing();
    return response.status(201).json({ saved: true });
  } catch (error) {
    request.log?.error({ error, productId }, "Wishlist item could not be saved");
    return response.status(503).json({ error: "This product could not be saved right now." });
  }
});

router.delete("/account/wishlist/:productId", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to edit your wishlist." });
  const productId = parseProductId(request.params.productId);
  if (productId === null) return response.status(400).json({ error: "Choose a valid product." });

  try {
    await db.delete(wishlistsTable).where(and(eq(wishlistsTable.userId, userId), eq(wishlistsTable.productId, productId)));
    return response.json({ saved: false });
  } catch (error) {
    request.log?.error({ error, productId }, "Wishlist item could not be removed");
    return response.status(503).json({ error: "This product could not be removed right now." });
  }
});

router.post("/account/wishlist/merge", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to merge your wishlist." });
  const productIds = parseProductIds(request.body?.productIds);

  try {
    const validProductIds = await getActiveWishlistProductIds(productIds);
    const productIdsToMerge = productIds.filter((productId) => validProductIds.has(productId));
    if (productIdsToMerge.length > 0) {
      await db.insert(wishlistsTable)
        .values(productIdsToMerge.map((productId) => ({ userId, productId })))
        .onConflictDoNothing();
    }
    return response.json({ productIds: await getWishlistProductIds(userId) });
  } catch (error) {
    request.log?.error({ error }, "Guest wishlist could not be merged");
    return response.status(503).json({ error: "Your saved wishlist could not be merged right now." });
  }
});

router.post("/account/wishlist/:productId/move-to-cart", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to move wishlist items." });
  const productId = parseProductId(request.params.productId);
  if (productId === null) return response.status(400).json({ error: "Choose a valid product." });

  try {
    await db.delete(wishlistsTable).where(and(eq(wishlistsTable.userId, userId), eq(wishlistsTable.productId, productId)));
    return response.json({ saved: false });
  } catch (error) {
    request.log?.error({ error, productId }, "Wishlist item could not be moved to cart");
    return response.status(503).json({ error: "This product could not be moved to your bag right now." });
  }
});

router.get("/account/profile", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to view your saved details." });

  try {
    const [profile, clerkUser] = await Promise.all([
      db.select().from(customerProfilesTable).where(eq(customerProfilesTable.userId, userId)).limit(1),
      clerkClient.users.getUser(userId),
    ]);
    return response.set("Cache-Control", "no-store").json({
      profile: {
        firstName: profile[0]?.firstName || clerkUser.firstName || "",
        lastName: profile[0]?.lastName || clerkUser.lastName || "",
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        phone: profile[0]?.phone || "",
        addressLine1: profile[0]?.addressLine1 || "",
        addressLine2: profile[0]?.addressLine2 || "",
        city: profile[0]?.city || "",
        postcode: profile[0]?.postcode || "",
        country: profile[0]?.country || "GB",
      },
    });
  } catch (error) {
    request.log?.error({ error }, "Customer profile could not be loaded");
    return response.status(503).json({ error: "Your saved details could not be loaded right now." });
  }
});

router.put("/account/profile", async (request, response) => {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return response.status(401).json({ error: "Sign in to save your details." });

  const country = safeText(request.body?.country, 2).toUpperCase() || "GB";
  if (country !== "GB") return response.status(400).json({ error: "Only UK delivery addresses are available right now." });

  const profile = {
    userId,
    firstName: safeText(request.body?.firstName, 80),
    lastName: safeText(request.body?.lastName, 80),
    phone: safeText(request.body?.phone, 40),
    addressLine1: safeText(request.body?.addressLine1, 200),
    addressLine2: safeText(request.body?.addressLine2, 200),
    city: safeText(request.body?.city, 100),
    postcode: safeText(request.body?.postcode, 40),
    country,
    updatedAt: new Date(),
  };

  try {
    await db.insert(customerProfilesTable).values(profile).onConflictDoUpdate({
      target: customerProfilesTable.userId,
      set: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        addressLine1: profile.addressLine1,
        addressLine2: profile.addressLine2,
        city: profile.city,
        postcode: profile.postcode,
        country: profile.country,
        updatedAt: profile.updatedAt,
      },
    });
    return response.json({ profile });
  } catch (error) {
    request.log?.error({ error }, "Customer profile could not be saved");
    return response.status(503).json({ error: "Your saved details could not be saved right now." });
  }
});

export default router;