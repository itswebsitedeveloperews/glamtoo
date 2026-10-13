/** Isolated payment provider used only by the guest-checkout test build. Never charges cards. */
export const intents = new Map<string, any>();
export const sessions = new Map<string, any>();
export const customers = new Map<string, any>();
let sequence = 0;
const id = (prefix: string) => `${prefix}_GuestTest${++sequence}`;
export const fakeStripe = {
  paymentIntents: {
    async create(options: any) {
      const intent = { ...options, id: id("pi"), status: "requires_payment_method", client_secret: "test-only-secret" };
      intents.set(intent.id, intent);
      return intent;
    },
    async retrieve(reference: string) {
      if (!intents.has(reference)) throw new Error("Unknown isolated test payment");
      return intents.get(reference);
    },
    async cancel(reference: string) {
      const intent = await this.retrieve(reference);
      intent.status = "canceled";
      return intent;
    },
  },
  checkout: { sessions: {
    async create(options: any) {
      const session = { ...options, id: id("cs"), url: "https://checkout.stripe.test/guest", status: "open", payment_status: "unpaid", expires_at: Math.floor(Date.now() / 1000) + 86400 };
      sessions.set(session.id, session);
      return session;
    },
    async retrieve(reference: string) {
      if (!sessions.has(reference)) throw new Error("Unknown isolated test session");
      return sessions.get(reference);
    },
    async expire(reference: string) {
      const session = await this.retrieve(reference);
      session.status = "expired";
      return session;
    },
  } },
  customers: {
    async list() { return { data: [...customers.values()] }; },
    async create(options: any) { const customer = { ...options, id: id("cus") }; customers.set(customer.id, customer); return customer; },
    async update(reference: string, options: any) { const customer = { ...customers.get(reference), ...options }; customers.set(reference, customer); return customer; },
  },
  paymentMethods: { async retrieve() { return { customer: "cus_not_the_owner" }; } },
  products: {
    async list() { return { data: [] }; },
    async create(options: any) { return { ...options, id: id("prod") }; },
  },
  prices: {
    async list() { return { data: [] }; },
    async create(options: any) { return { ...options, id: id("price") }; },
  },
  coupons: { async create() { return { id: id("coupon") }; } },
};
