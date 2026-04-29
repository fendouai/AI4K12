/**
 * Capture student-facing UI for docs (requires local server + playwright).
 * Student flow matches the product: open teacher-generated link, pick name, enter workspace.
 * Usage: npm run screenshots
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const base = process.env.AI4K12_BASE_URL || "http://127.0.0.1:3000";
const joinCode = process.env.AI4K12_JOIN_CODE || "5N3L38";
const teacherVerificationCode = process.env.AI4K12_TEACHER_VERIFICATION_CODE || "CHCVE76F";

const outDir = path.join(__dirname, "..", "docs", "screenshots") + path.sep;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const joinUrl = `${base}/?joinCode=${encodeURIComponent(joinCode)}&teacherVerificationCode=${encodeURIComponent(teacherVerificationCode)}`;
await page.goto(joinUrl, { waitUntil: "networkidle" });
await page.waitForFunction(() => {
  const sel = document.querySelector("#student-join-select");
  return sel && sel.options.length > 1;
});
await page.screenshot({ path: `${outDir}07-student-join-link.png`, fullPage: true });

await page.selectOption("#student-join-select", "S001");
await page.getByRole("button", { name: "选择并登录" }).click();
await page.waitForSelector("#student-workspace:not(.hidden)", { timeout: 15_000 });
await page.screenshot({ path: `${outDir}08-student-workspace.png`, fullPage: true });

await browser.close();
console.log("Wrote docs/screenshots/07-student-join-link.png and 08-student-workspace.png");
