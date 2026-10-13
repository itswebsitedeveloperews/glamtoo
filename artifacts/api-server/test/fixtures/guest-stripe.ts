/** Isolated payment provider used only by the guest-checkout test build. Never charges cards. */
export const intents = new Map<string, any>();
export const sessions = new Map<string, any>();
export const customers = new Map<string, any>();
export const providerKeys = new Map<string, any>();
export let loseNextCreateResponse = false;
export function loseCreateResponse() { loseNextCreateResponse = true; }
export let providerMode = false;
export let providerAccount = "acct_isolated";
export function setProviderScope(account: string, live: boolean) { providerAccount = account; providerMode = live; }
export let cancellationFails = false;
export function setCancellationFails(value: boolean) { cancellationFails = value; }
let sequence = 0;
const id = (prefix: string) => `${prefix}_GuestTest${++sequence}`;
export const fakeStripe = {
  accounts: { async retrieve() { return { id: providerAccount }; } },
  balance: { async retrieve() { return { livemode: providerMode }; } },
  paymentIntents: {
    async create(options: any, requestOptions?: any) {
      const key = requestOptions?.idempotencyKey;
      if (key && providerKeys.has(key)) return providerKeys.get(key);
      const intent = { ...options, id: id("pi"), status: "requires_payment_method", client_secret: "test-only-secret" };
      intents.set(intent.id, intent);
      if (key) providerKeys.set(key, intent);
      if (loseNextCreateResponse) { loseNextCreateResponse = false; throw new Error("Isolated lost provider response"); }
      return intent;
    },
    async list(options: any) { const values = [...intents.values()]; const start = options.starting_after ? values.findIndex((item) => item.id === options.starting_after) + 1 : 0; return { data: values.slice(start, start + 100), has_more: values.length > start + 100 }; },
    async retrieve(reference: string) {
      if (!intents.has(reference)) throw new Error("Unknown isolated test payment");
      return intents.get(reference);
    },
    async cancel(reference: string) {
      if (cancellationFails) throw new Error("Isolated cancellation unavailable");
      const intent = await this.retrieve(reference);
      intent.status = "canceled";
      return intent;
    },
  },
  checkout: { sessions: {
    async create(options: any, requestOptions?: any) {
      const key = requestOptions?.idempotencyKey;
      if (key && providerKeys.has(key)) return providerKeys.get(key);
      const session = { ...options, id: id("cs"), url: "https://checkout.stripe.test/guest", status: "open", payment_status: "unpaid", expires_at: Math.floor(Date.now() / 1000) + 86400 };
      sessions.set(session.id, session);
      if (key) providerKeys.set(key, session);
      if (loseNextCreateResponse) { loseNextCreateResponse = false; throw new Error("Isolated lost provider response"); }
      return session;
    },
    async list(options: any) { const values = [...sessions.values()]; const start = options.starting_after ? values.findIndex((item) => item.id === options.starting_after) + 1 : 0; return { data: values.slice(start, start + 100), has_more: values.length > start + 100 }; },
    async retrieve(reference: string) {
      if (!sessions.has(reference)) throw new Error("Unknown isolated test session");
      return sessions.get(reference);
    },
    async expire(reference: string) {
      if (cancellationFails) throw new Error("Isolated cancellation unavailable");
      const session = await this.retrieve(reference);
      session.status = "expired";
      return session;
    },
  } },
  customers: {
    async list(options: any) { const values = [...customers.values()]; const start = options.starting_after ? values.findIndex((item) => item.id === options.starting_after) + 1 : 0; return { data: values.slice(start, start + 100), has_more: values.length > start + 100 }; },
    async retrieve(reference: string) { if (!customers.has(reference)) throw new Error("Unknown isolated customer"); return customers.get(reference); },
    async create(options: any, requestOptions?: any) {
      const key = requestOptions?.idempotencyKey;
      if (key && providerKeys.has(key)) return providerKeys.get(key);
      const customer = { ...options, id: id("cus") }; customers.set(customer.id, customer);
      if (key) providerKeys.set(key, customer);
      return customer;
    },
    async update(reference: string, options: any) { const customer = { ...customers.get(reference), ...options }; customers.set(reference, customer); return customer; },
  },
  paymentMethods: {
    async retrieve() { return { customer: "cus_not_the_owner" }; },
    async list(options: any) { return { data: [{ id: "pm_isolated", customer: options.customer, card: { brand: "visa", last4: "4242", exp_month: 1, exp_year: 2030 } }] }; },
  },
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
