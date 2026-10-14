export const smtpCalls: any[] = [];
export const smtpConnections: any[] = [];
export let smtpFailure: Record<string, unknown> | null = null;
export let mismatchedRecipient = false;
let smtpHold: Promise<void> | null = null;
const recipientFailures = new Map<string, Record<string, unknown>>();
export function setRecipientFailure(email: string, failure: Record<string, unknown>) { recipientFailures.set(email, failure); }
export function holdSmtp(promise: Promise<void>) { smtpHold = promise; }
export function resetSmtp() {
  smtpCalls.length = 0; smtpConnections.length = 0;
  smtpFailure = null; mismatchedRecipient = false; smtpHold = null; recipientFailures.clear();
}
export function setSmtpFailure(failure: Record<string, unknown> | null) { smtpFailure = failure; }
export function setMismatchedRecipient() { mismatchedRecipient = true; }

export default {
  createTransport(options: any) {
    const connection = { options, closed: false };
    smtpConnections.push(connection);
    return {
      async sendMail(message: any) {
        smtpCalls.push(message);
        if (smtpHold) await smtpHold;
        const failure = recipientFailures.get(message.to) ?? smtpFailure;
        if (failure) throw Object.assign(new Error("Simulated SMTP error with private recipient data"), failure);
        return {
          accepted: [mismatchedRecipient ? "another@example.test" : message.to],
          rejected: [], messageId: message.messageId, response: "250 2.0.0 OK test-queue-id",
        };
      },
      async verify() { if (smtpFailure) throw new Error("Simulated credentials error"); return true; },
      close() { connection.closed = true; },
    };
  },
};
