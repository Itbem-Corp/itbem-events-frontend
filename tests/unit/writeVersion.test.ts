import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-ignore -- the build script is native ESM JavaScript by design.
import { resolveBuildSha, versionDocument, writeVersionFile } from "../../scripts/write-version.mjs";

const sha = "3a5221c68a24ea5b0ef0629fb692714f7d45732c";
const noGit = () => null;

describe("version.json", () => {
  it("uses GITHUB_SHA on GitHub Actions", () => {
    expect(resolveBuildSha({ GITHUB_ACTIONS: "true", GITHUB_SHA: sha.toUpperCase() }, noGit)).toEqual({ sha, source: "GITHUB_SHA" });
  });

  it("refuses to build on Actions without a valid GITHUB_SHA", () => {
    expect(() => resolveBuildSha({ GITHUB_ACTIONS: "true" }, noGit)).toThrow(/GITHUB_SHA/);
    expect(() => resolveBuildSha({ GITHUB_ACTIONS: "true", GITHUB_SHA: "abc1234" }, noGit)).toThrow(/GITHUB_SHA/);
  });

  it("falls back to the checkout's HEAD locally, then to null", () => {
    expect(resolveBuildSha({}, () => `${sha}\n`)).toEqual({ sha, source: "git" });
    expect(resolveBuildSha({}, () => "not a sha")).toEqual({ sha: null, source: "unknown" });
  });

  it("writes the sha as JSON", () => {
    const out = join(mkdtempSync(join(tmpdir(), "version-")), "client", "version.json");
    writeVersionFile(out, { GITHUB_ACTIONS: "true", GITHUB_SHA: sha });
    const doc = JSON.parse(readFileSync(out, "utf8"));
    expect(doc.sha).toBe(sha);
    expect(doc.source).toBe("GITHUB_SHA");
    expect(versionDocument({ sha, source: "git" }, new Date("2026-10-27T00:00:00Z"))).toEqual({ sha, source: "git", builtAt: "2026-10-27T00:00:00.000Z" });
  });
});
