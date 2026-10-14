// Local dependency/DOM contract checks only. No Clerk/Stripe network requests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as clerk from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";

test("updated Clerk packages retain the application's embedded-auth exports", () => {
  for (const name of ["ClerkProvider", "SignIn", "SignUp", "useAuth", "useClerk", "useSignIn", "useUser"]) {
    assert.ok(clerk[name], name);
  }
  assert.equal(typeof publishableKeyFromHost, "function");
  assert.ok(shadcn);
});

async function stripeLoader({ loaded = false } = {}) {
  const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "loadStripeJs");
  assert.ok(declaration, "test must exercise the actual application loader");
  const compiled = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const scripts = [];
  const document = {
    getElementById: (id) => scripts.find((item) => item.id === id),
    createElement(tag) {
      assert.equal(tag, "script");
      const listeners = {};
      return { addEventListener: (name, callback) => { listeners[name] = callback; }, listeners };
    },
    head: { appendChild: (script) => scripts.push(script) },
  };
  const context = vm.createContext({ window: loaded ? { Stripe() {} } : {}, document });
  vm.runInContext(`${compiled}; this.load = loadStripeJs;`, context);
  return { load: context.load, scripts };
}

test("Stripe loader reuses an existing SDK and shares a single script between callers", async () => {
  const loaded = await stripeLoader({ loaded: true });
  await loaded.load();
  assert.equal(loaded.scripts.length, 0);
  const pending = await stripeLoader();
  const first = pending.load();
  const second = pending.load();
  assert.equal(pending.scripts.length, 1);
  const script = pending.scripts[0];
  assert.equal(script.src, "https://js.stripe.com/v3/");
  assert.equal(script.async, true);
  script.onload();
  script.listeners.load();
  await Promise.all([first, second]);
});

test("Stripe script failure is visible to every waiting caller", async () => {
  const pending = await stripeLoader();
  const first = assert.rejects(pending.load(), /Stripe card fields could not be loaded/);
  const second = assert.rejects(pending.load(), /Stripe card fields could not be loaded/);
  pending.scripts[0].onerror();
  pending.scripts[0].listeners.error();
  await Promise.all([first, second]);
});
