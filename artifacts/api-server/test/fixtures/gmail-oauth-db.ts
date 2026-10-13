export const states = new Map<string, any>();
export let authorization: any = null;
export function resetOAuthDb() { states.clear(); authorization = null; }
export const pool = {
  async query(sql: string, values: any[] = []) {
    if (sql.startsWith("SELECT COUNT")) return { rows: [{ count: [...states.values()].filter(s => s.admin_user_id === values[0] && s.expires_at > new Date()).length }] };
    if (sql.startsWith("SELECT encrypted_refresh_token")) return { rows: authorization ? [authorization] : [] };
    if (sql.includes("INSERT INTO store_gmail_oauth_states")) {
      states.set(values[0], { admin_user_id: values[1], encrypted_verifier: values[2], client_binding: values[3], expires_at: new Date(Date.now() + 600_000) });
      return { rows: [] };
    }
    if (sql.includes("DELETE FROM store_gmail_oauth_states") && sql.includes("nonce_hash")) {
      const value = states.get(values[0]);
      if (!value || value.expires_at <= new Date()) return { rows: [] };
      states.delete(values[0]); return { rows: [value] };
    }
    if (sql.includes("DELETE FROM store_gmail_oauth_states")) {
      for (const [key, state] of states) if (state.expires_at < new Date()) states.delete(key);
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO store_gmail_oauth_credentials")) {
      authorization = {
        encrypted_refresh_token: values[0], client_binding: values[1], updated_by: values[2],
        enabled_at: authorization?.client_binding === values[1] ? authorization.enabled_at : new Date(),
      };
      return { rows: [] };
    }
    throw new Error("Unexpected isolated OAuth database query.");
  },
};
