---
name: Embedded Stripe card checkout
description: Security and fulfillment boundary for Glam Too's in-page Stripe card form.
---

Checkout uses Stripe.js to render the card frame in the Glam Too payment section. The browser receives only the Stripe publishable key and a short-lived PaymentIntent client secret; the secret key and server-validated pricing stay on the API.

**Why:** Customers asked to enter card details in the WooCommerce-style checkout rather than being redirected before seeing payment inputs. Stripe.js preserves the payment-card security boundary while keeping the storefront experience in-page.

**How to apply:** Create PaymentIntents only after the API validates the signed-in customer, catalog items, delivery choice, and address. Confirm cards client-side through Stripe.js, and preserve successful PaymentIntent orders in customer history and admin fulfilment alongside hosted Checkout Session orders.