const validationMessages: Record<string, string> = {
  form_password_pwned: "This password has appeared in a data breach. Please choose a different password.",
  form_password_length_too_short: "This password is too short. Please choose a longer password.",
  form_code_incorrect: "That verification code is incorrect. Please check it and try again.",
  verification_expired: "Your verification code has expired. Please request a new code.",
};

/** Clerk's signal API exposes a ClerkError; older API errors may live in its cause. */
export function getRecoveryErrorMessage(error: unknown, fallback: string): string {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 3 && current && typeof current === "object"; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const value = current as {
      longMessage?: unknown;
      code?: unknown;
      errors?: Array<{ longMessage?: string; message?: string; code?: string }>;
      cause?: unknown;
    };
    if (typeof value.longMessage === "string" && value.longMessage.trim()) return value.longMessage;
    const apiError = value.errors?.[0];
    if (apiError?.longMessage) return apiError.longMessage;
    if (apiError?.code && Object.hasOwn(validationMessages, apiError.code)) return validationMessages[apiError.code];
    if (apiError?.message) return apiError.message;
    if (typeof value.code === "string" && Object.hasOwn(validationMessages, value.code)) return validationMessages[value.code];
    current = value.cause;
  }
  // ClerkError.message is developer-facing and can include diagnostic details.
  return fallback;
}

type RecoveryResource = {
  readonly status: string | null;
  resetPasswordEmailCode: {
    submitPassword: (params: { password: string }) => Promise<{ error: unknown }>;
  };
  finalize: () => Promise<{ error: unknown }>;
};

type RecoveryOutcome =
  | { kind: "complete" }
  | { kind: "verification" }
  | { kind: "saved"; error: unknown };

class RecoverySessionError extends Error {
  readonly longMessage: string;
  constructor(message: string) {
    super(message);
    this.longMessage = message;
  }
}

export async function saveRecoveryPassword(signIn: RecoveryResource, password: string): Promise<RecoveryOutcome> {
  const result = await signIn.resetPasswordEmailCode.submitPassword({ password });
  if (result.error) throw result.error;
  if (["needs_second_factor", "needs_client_trust", "needs_protect_check"].includes(signIn.status ?? "")) {
    return { kind: "verification" };
  }
  if (signIn.status !== "complete") {
    throw new RecoverySessionError("This recovery session is no longer ready to save a password. Please request a new code and try again.");
  }
  // A failed session activation must not be presented as a failed password change.
  try {
    const finalized = await signIn.finalize();
    return finalized.error ? { kind: "saved", error: finalized.error } : { kind: "complete" };
  } catch (error) {
    return { kind: "saved", error };
  }
}
