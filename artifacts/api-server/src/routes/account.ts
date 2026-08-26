import { clerkClient, getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { customerProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

function safeText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

async function getAuthenticatedUserId(request: Parameters<typeof getAuth>[0]) {
  const { userId } = getAuth(request);
  return userId || null;
}

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