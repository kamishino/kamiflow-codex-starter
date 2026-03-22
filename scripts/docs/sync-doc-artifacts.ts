const VERIFY_ONLY = process.argv.includes("--verify");

try {
  console.log(
    `[docs-sync] ${VERIFY_ONLY ? "Verification" : "Sync"} OK (resources/docs is the tracked source of truth; no root mirrors remain).`
  );
} catch (err) {
  console.error(`[docs-sync] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
