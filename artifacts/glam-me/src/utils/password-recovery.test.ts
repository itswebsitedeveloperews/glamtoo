import assert from "node:assert/strict";
import { test } from "node:test";
import { getRecoveryErrorMessage, saveRecoveryPassword } from "./password-recovery.ts";

test("signal ClerkError validation is shown instead of its developer message", () => {
  assert.equal(getRecoveryErrorMessage({
    longMessage: "Please choose a password that has not appeared in a breach.",
    message: "Internal SDK details",
  }, "Fallback"), "Please choose a password that has not appeared in a breach.");
  assert.equal(getRecoveryErrorMessage({ message: "Internal SDK details" }, "Fallback"), "Fallback");
  assert.equal(getRecoveryErrorMessage({ code: "constructor" }, "Fallback"), "Fallback");
});

test("legacy API errors, wrapped causes and known validation codes remain useful", () => {
  assert.equal(getRecoveryErrorMessage({ cause: { errors: [{ longMessage: "Use at least 12 characters." }] } }, "Fallback"), "Use at least 12 characters.");
  assert.match(getRecoveryErrorMessage({ code: "form_password_pwned" }, "Fallback"), /data breach/);
  assert.match(getRecoveryErrorMessage({ errors: [{ code: "form_code_incorrect" }] }, "Fallback"), /incorrect/);
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  assert.equal(getRecoveryErrorMessage(cyclic, "Fallback"), "Fallback");
});

test("a rejected password preserves Clerk's error and never finalizes", async () => {
  const providerError = { longMessage: "Choose a stronger password." };
  let finalized = false;
  await assert.rejects(saveRecoveryPassword({
    status: "needs_new_password",
    resetPasswordEmailCode: { submitPassword: async () => ({ error: providerError }) },
    finalize: async () => { finalized = true; return { error: null }; },
  }, "test-value"), (error) => error === providerError);
  assert.equal(finalized, false);
});

test("an accepted password finalizes exactly once using the updated resource status", async () => {
  let finalized = 0;
  const signIn = {
    status: "needs_new_password",
    resetPasswordEmailCode: { submitPassword: async ({ password }: { password: string }) => {
      assert.equal(password, "test-value");
      signIn.status = "complete";
      return { error: null };
    } },
    finalize: async () => { finalized++; return { error: null }; },
  };
  assert.deepEqual(await saveRecoveryPassword(signIn, "test-value"), { kind: "complete" });
  assert.equal(finalized, 1);
});

test("additional authentication is not bypassed or reported as a password failure", async () => {
  for (const status of ["needs_second_factor", "needs_client_trust", "needs_protect_check"]) {
    assert.deepEqual(await saveRecoveryPassword({
      status,
      resetPasswordEmailCode: { submitPassword: async () => ({ error: null }) },
      finalize: async () => { assert.fail("Cannot finalize before verification"); },
    }, "test-value"), { kind: "verification" });
  }
});

test("session activation failure does not falsely say the password was rejected", async () => {
  const error = { longMessage: "Session could not be activated." };
  for (const throws of [false, true]) {
    assert.deepEqual(await saveRecoveryPassword({
      status: "complete",
      resetPasswordEmailCode: { submitPassword: async () => ({ error: null }) },
      finalize: async () => { if (throws) throw error; return { error }; },
    }, "test-value"), { kind: "saved", error });
  }
});

test("an incomplete recovery attempt never activates a session or claims success", async () => {
  await assert.rejects(saveRecoveryPassword({
    status: "needs_new_password",
    resetPasswordEmailCode: { submitPassword: async () => ({ error: null }) },
    finalize: async () => { assert.fail("Unexpected finalization"); },
  }, "test-value"), (error: unknown) => getRecoveryErrorMessage(error, "").includes("request a new code"));
});
