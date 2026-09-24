import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const oxlintBin = join(packageDir, "node_modules", ".bin", "oxlint");

interface OxlintDiagnostic {
  filename: string;
  code: string;
  message: string;
}

let diagnostics: OxlintDiagnostic[] = [];

// oxlint reports codes as "plugin(rule)"; normalize to "plugin/rule".
function findings(file: string, ruleId: string): OxlintDiagnostic[] {
  return diagnostics.filter(
    (d) =>
      d.filename.endsWith(`fixtures/${file}`) &&
      d.code.replace(/^([^(]+)\((.+)\)$/, "$1/$2") === ruleId,
  );
}

beforeAll(async () => {
  // oxlint exits non-zero when it finds violations, which is exactly what the
  // fixtures are for — capture stdout either way.
  const raw = await execFileAsync(
    oxlintBin,
    [
      "--type-aware",
      "-c",
      join(packageDir, "fixtures", ".oxlintrc.json"),
      "-f",
      "json",
      join(packageDir, "fixtures"),
    ],
    { cwd: packageDir },
  ).then(
    (r) => r.stdout,
    (e: { stdout?: string }) => e.stdout ?? "",
  );
  diagnostics = (JSON.parse(raw) as { diagnostics: OxlintDiagnostic[] }).diagnostics;
}, 120_000);

describe("custom domain rules fire via oxlint JS plugins", () => {
  it.each([
    "no-global-accounts-state",
    "no-global-perp-engine-state",
    "no-get-account-resource",
    "no-raw-address-comparison",
  ])("custom/%s", (rule) => {
    expect(findings("custom-rules.ts", `custom/${rule}`)).not.toHaveLength(0);
  });

  // Pinning the exact set guards both directions: a missed detection and a new false positive.
  it("custom/no-raw-address-comparison reports exactly the seeded violations", () => {
    const lines = findings("custom-rules.ts", "custom/no-raw-address-comparison").map(
      (d) => d.message,
    );
    expect(lines).toHaveLength(9);
    expect(lines.filter((m) => m.includes("One side is canonicalized"))).toHaveLength(1);
    expect(lines.filter((m) => m.includes("Membership tests"))).toHaveLength(2);
  });
});

describe("import sorting fires via oxlint JS plugin", () => {
  it("simple-import-sort/imports", () => {
    expect(findings("import-sort.ts", "simple-import-sort/imports")).not.toHaveLength(0);
  });
});

describe("type-aware rules fire via tsgolint", () => {
  it("typescript/no-floating-promises", () => {
    expect(findings("type-aware.ts", "typescript/no-floating-promises")).not.toHaveLength(0);
  });

  it("typescript/no-unsafe-call", () => {
    expect(findings("type-aware.ts", "typescript/no-unsafe-call")).not.toHaveLength(0);
  });

  it("eslint-disable comments with @typescript-eslint prefix are honored", () => {
    expect(findings("type-aware.ts", "typescript/no-explicit-any")).toHaveLength(0);
  });
});

describe("carried-over base rules fire", () => {
  it("typescript/no-explicit-any", () => {
    expect(findings("base-rules.ts", "typescript/no-explicit-any")).not.toHaveLength(0);
  });

  it("eslint/object-shorthand", () => {
    expect(findings("base-rules.ts", "eslint/object-shorthand")).not.toHaveLength(0);
  });

  it("import/no-default-export", () => {
    expect(findings("default-export.ts", "import/no-default-export")).not.toHaveLength(0);
  });
});
