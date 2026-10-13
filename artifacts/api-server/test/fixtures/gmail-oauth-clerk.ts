export let adminRevoked = false;
export function setAdminRevoked(value: boolean) { adminRevoked = value; }
export const getAuth = (req: any) => ({ userId: req.headers["x-test-user"] || null });
export const clerkClient = {
  users: {
    async getUser(id: string) {
      return { emailAddresses: [], privateMetadata: { role: id === "oauth-admin" && !adminRevoked ? "admin" : "customer" } };
    },
  },
};
