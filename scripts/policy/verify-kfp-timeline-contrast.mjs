import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyKfpContrast } from "./verify-kfp-contrast.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultCssPath = path.join(repoRoot, "packages", "kamiflow-plan-ui", "src", "server", "public", "styles.css");

export async function verifyKfpTimelineContrast(cssPath = defaultCssPath) {
  const result = await verifyKfpContrast(cssPath);
  const timelineFailures = result.failures.filter((item) => item.startsWith("timeline-"));
  return { failures: timelineFailures, checksCount: 7 };
}

const isCliEntry = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
if (isCliEntry) {
  const result = await verifyKfpTimelineContrast();
  if (result.failures.length) {
    console.error("[kfp-timeline-contrast] FAILED");
    for (const line of result.failures) {
      console.error(" - " + line);
    }
    process.exit(1);
  }

  console.log(`[kfp-timeline-contrast] OK (${result.checksCount} checks)`);
}
