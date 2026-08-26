import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

function configuredAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getAdminAccess(request: Request) {
  const { userId } = getAuth(request);
  if (!userId) {
    return { authenticated: false, authorized: false };
  }

  const user = await clerkClient.users.getUser(userId);
  const userEmails = user.emailAddresses.map((email) => email.emailAddress.toLowerCase());
  const isBootstrapAdmin = userEmails.some((email) => configuredAdminEmails().has(email));
  const authorized = isBootstrapAdmin || user.privateMetadata?.role === "admin";

  return { authenticated: true, authorized, userId, isBootstrapAdmin };
}

export async function requireAdmin(request: Request, response: Response, next: NextFunction) {
  try {
    const access = await getAdminAccess(request);
    if (!access.authenticated) {
      return response.status(401).json({ error: "Sign in to continue." });
    }
    if (!access.authorized) {
      return response.status(403).json({ error: "This account is not authorized for admin access." });
    }
    return next();
  } catch (error) {
    request.log?.error({ error }, "Admin access check failed");
    return response.status(503).json({ error: "Admin access could not be verified right now." });
  }
}