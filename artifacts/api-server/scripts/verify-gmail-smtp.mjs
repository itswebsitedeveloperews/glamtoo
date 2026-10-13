import { build } from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Authenticate only: this command never sends email or changes an order.
const built = await build({
  entryPoints: [fileURLToPath(new URL("../src/gmailSmtp.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent",
});
const child = spawn(process.execPath, ["-"], { stdio: ["pipe", "inherit", "inherit"], env: process.env });
child.stdin.end(`${built.outputFiles[0].text}
module.exports.verifyGmailSmtp()
  .then(() => console.log("Gmail SMTP authentication verified. No email was sent; inbox delivery is not verified."))
  .catch(() => { console.error("Gmail SMTP authentication was not verified. Check secure credentials and account settings."); process.exitCode = 1; });
`);
child.on("error", () => { console.error("Could not start Gmail SMTP verification."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
