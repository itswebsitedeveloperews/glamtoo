// Test-bundle-only auth fixture. Production imports the real @clerk/express;
// no test header, user creation, or role override is installed in the app.
import type { Request } from "express";
if (process.env.NODE_ENV !== "test") throw new Error("Review auth fixtures require NODE_ENV=test");
export const getAuth = (request: Request) => ({ userId: request.get("x-review-test-user") || null });
export const clerkClient = { users: { getUser: async (id: string) => ({
  firstName: "Review Tester", username: null,
  emailAddresses: [],
  privateMetadata: { role: id.startsWith("review-test-admin-") ? "admin" : "customer" },
}) } };
