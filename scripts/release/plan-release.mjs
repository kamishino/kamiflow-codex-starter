import { analyzeSemver } from "./semver-from-commits.mjs";

function usage() {
  console.log(
    [
      "Usage: node scripts/release/plan-release.mjs [--from-tag <tag>] [--json]",
      "",
      "Shows release planning summary and recommended bump from commit history."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const out = { fromTag: "", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--from-tag") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --from-tag.");
      }
      out.fromTag = value;
      i += 1;
      continue;
    }
    if (token === "--json") {
      out.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return out;
}

function printPlan(summary) {
  console.log("Release Plan");
  console.log(`- Current version: ${summary.currentVersion}`);
  console.log(`- Last semver tag: ${summary.lastTag || "<none>"}`);
  console.log(`- Commits analyzed: ${summary.commitCount}`);
  console.log(`- Suggested bump: ${summary.suggestedBump}`);
  console.log(`- Suggested next version: ${summary.suggestedNextVersion}`);
  console.log("");
  console.log("Manual choice required for release:");
  console.log(`npm run release:cut -- --bump <major|minor|patch>`);

  if (summary.commits.length > 0) {
    console.log("");
    console.log("Recent commits:");
    for (const commit of summary.commits.slice(0, 20)) {
      const marker = commit.breaking ? "!" : "";
      console.log(`- ${commit.shortHash} [${commit.type}${marker}] ${commit.subject}`);
    }
    if (summary.commits.length > 20) {
      console.log(`- ... (${summary.commits.length - 20} more)`);
    }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const summary = analyzeSemver({ fromTag: args.fromTag });
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printPlan(summary);
  }
} catch (err) {
  console.error(`[release-plan] ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
