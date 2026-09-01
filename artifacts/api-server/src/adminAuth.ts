import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export type AdminUser = {
  emailAddresses: Array<{ emailAddress: string }>;
  privateMetadata?: Record<string, unknown>;
};

export type AdminAccess = {
  authenticated: boolean;
  authorized: boolean;
  userId?: string;
  isBootstrapAdmin?: boolean;
};

export function configuredAdminEmails(value = process.env.ADMIN_EMAILS) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isBootstrapAdminUser(user: AdminUser, bootstrapEmails = configuredAdminEmails()) {
  return user.emailAddresses.some((email) => bootstrapEmails.has(email.emailAddress.toLowerCase()));
}

export function isAdminUser(user: AdminUser, bootstrapEmails = configuredAdminEmails()) {
  return isBootstrapAdminUser(user, bootstrapEmails) || user.privateMetadata?.role === "admin";
}

export async function getAdminAccess(request: Request): Promise<AdminAccess> {
  const { userId } = getAuth(request);
  if (!userId) {
    return { authenticated: false, authorized: false };
  }

  const user = await clerkClient.users.getUser(userId);
  const isBootstrapAdmin = isBootstrapAdminUser(user);
  const authorized = isAdminUser(user);

  return { authenticated: true, authorized, userId, isBootstrapAdmin };
}

export function createRequireAdmin(resolveAccess: (request: Request) => Promise<AdminAccess>) {
  return async function requireAdmin(request: Request, response: Response, next: NextFunction) {
    try {
      const access = await resolveAccess(request);
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
  };
}

export const requireAdmin = createRequireAdmin(getAdminAccess);