// Synthetic, signed-out Frontend API settings. No captured clients, users, tokens,
// cookies, tenant IDs or credentials. Keep the real SDK/modal and application theme.
const attribute = (enabled = false, required = false, factors: string[] = []) => ({
  enabled, required, used_for_first_factor: factors.length > 0, first_factors: factors,
  used_for_second_factor: false, second_factors: [], verifications: factors,
  verify_at_sign_up: enabled && factors.length > 0, immutable: false,
});

export const clerkEnvironment = {
  auth_config: {
    object: "auth_config", id: "aac_isolated",
    first_name: "off", last_name: "off", email_address: "on", phone_number: "off", username: "off",
    password: "required", identification_requirements: [["email_address", "oauth_google"], []],
    identification_strategies: ["email_address", "oauth_google"],
    first_factors: ["email_code", "oauth_google", "password", "reset_password_email_code", "ticket"],
    second_factors: [], email_address_verification_strategies: ["email_code"],
    single_session_mode: true, test_mode: true, cookieless_dev: true, url_based_session_syncing: true,
    claimed_at: null, reverification: true, session_minter: true,
  },
  display_config: {
    object: "display_config", id: "display_config_isolated", instance_environment_type: "development",
    application_name: "Glam Too Boutique", theme: {}, preferred_sign_in_strategy: "password",
    home_url: "http://localhost", sign_in_url: "http://localhost/account",
    sign_up_url: "http://localhost/register", user_profile_url: "http://localhost/account",
    after_sign_in_url: "http://localhost", after_sign_up_url: "http://localhost",
    after_sign_out_one_url: "http://localhost/account", after_sign_out_all_url: "http://localhost/account",
    after_switch_session_url: "http://localhost", logo_link_url: "http://localhost",
    logo_image_url: "", favicon_image_url: "", logo_image: null, favicon_image: null,
    // Customer-facing dialog configuration, without Clerk's developer-only
    // orange warning. All visible customer text is measured; none is excluded.
    branded: false, clerk_js_version: "6", show_devmode_warning: false,
    google_one_tap_client_id: null, support_email: null, help_url: null,
    privacy_policy_url: null, terms_url: null, captcha_public_key: null,
  },
  user_settings: {
    attributes: {
      email_address: attribute(true, true, ["email_code"]), password: attribute(true, true),
      phone_number: attribute(), username: attribute(), first_name: attribute(), last_name: attribute(),
      web3_wallet: attribute(), authenticator_app: attribute(), ticket: attribute(true),
      backup_code: attribute(), passkey: attribute(),
    },
    sign_in: { second_factor: { required: false } },
    sign_up: { captcha_enabled: false, custom_action_required: false, progressive: true, mode: "public", legal_consent_enabled: false, mfa: { required: false } },
    restrictions: { allowlist: { enabled: false }, blocklist: { enabled: false }, block_email_subaddresses: { enabled: false }, block_disposable_email_domains: { enabled: false } },
    actions: { delete_self: true, create_organization: false },
    attack_protection: { user_lockout: { enabled: true }, pii: { enabled: true }, enumeration_protection: { enabled: false } },
    social: { oauth_google: { enabled: true, required: false, authenticatable: true, strategy: "oauth_google", not_selectable: false, deprecated: false, name: "Google", logo_url: "https://img.clerk.com/static/google.png" } },
    password_settings: { min_length: 15, max_length: 0, disable_hibp: false, require_special_char: false, require_numbers: false, require_uppercase: false, require_lowercase: false, show_zxcvbn: false, min_zxcvbn_strength: 0 },
    saml: { enabled: false }, enterprise_sso: { enabled: false },
  },
  organization_settings: { enabled: false, max_allowed_memberships: 0, actions: { admin_delete: false }, domains: { enabled: false, enrollment_modes: [], default_role: "" }, slug: { disabled: true }, creator_role: "org:admin", force_organization_selection: false },
  fraud_settings: { object: "fraud_settings", native: { device_attestation_mode: "disabled" } },
  commerce_settings: { billing: { stripe_publishable_key: null, user: { enabled: false, has_paid_plans: false }, organization: { enabled: false, has_paid_plans: false } } },
  api_keys_settings: { enabled: false, user_api_keys_enabled: false, orgs_api_keys_enabled: false },
  maintenance_mode: false, client_debug_mode: false, partitioned_cookies: true,
};

export const signedOutClient = {
  object: "client", id: "client_isolated", sessions: [], sign_in: null, sign_up: null,
  last_active_session_id: null, created_at: 1700000000000, updated_at: 1700000000000,
};
