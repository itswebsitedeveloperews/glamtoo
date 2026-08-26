import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { getAdminAccess, requireAdmin } from "../adminAuth";

const router: IRouter = Router();

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

function isAdminUser(user: { emailAddresses: Array<{ emailAddress: string }>; privateMetadata?: Record<string, unknown> }) {
  const bootstrapEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  return user.privateMetadata?.role === "admin"
    || user.emailAddresses.some((email) => bootstrapEmails.has(email.emailAddress.toLowerCase()));
}

function serializeUser(user: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  primaryEmailAddressId: string | null;
  createdAt: number;
  lastSignInAt: number | null;
  privateMetadata?: Record<string, unknown>;
}) {
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? "";
  return {
    id: user.id,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unnamed customer",
    email: primaryEmail,
    createdAt: user.createdAt,
    lastSignInAt: user.lastSignInAt,
    isAdmin: isAdminUser(user),
    isBootstrapAdmin: user.emailAddresses.some((email) => {
      const bootstrapEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      return bootstrapEmails.includes(email.emailAddress.toLowerCase());
    }),
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
    return response.set("Cache-Control", "no-store").json({ users: users.map(serializeUser) });
  } catch (error) {
    request.log?.error({ error }, "Admin user list failed");
    return response.status(503).json({ error: "User accounts could not be loaded right now." });
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

export default router;