import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.join(process.cwd(), "src");
const SOURCE_EXTENSIONS = new Set([".astro", ".mjs", ".ts", ".tsx"]);
const ALLOWED_ROUTE_LITERAL_FILES = new Set([
  "src/lib/apiCachePolicy.mjs",
  "src/lib/apiUrls.ts",
  "src/lib/pageSpecUrl.ts",
]);

const DIRECT_BACKEND_API_ROUTE_PATTERN =
  /\/?api\/(?:events|invitations|moments|resources)(?:\/|[?"'`)]|$)/g;

function sourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...sourceFiles(fullPath));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry))) files.push(fullPath);
  }

  return files;
}

function stripJsLikeComments(source: string): string {
  let output = "";
  let state: "normal" | "single" | "double" | "template" | "line" | "block" =
    "normal";
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (state === "line") {
      if (char === "\n") {
        state = "normal";
        output += char;
      }
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "normal";
        i += 1;
      } else if (char === "\n") {
        output += char;
      }
      continue;
    }

    if (state === "normal") {
      if (char === "/" && next === "/") {
        state = "line";
        i += 1;
        continue;
      }
      if (char === "/" && next === "*") {
        state = "block";
        i += 1;
        continue;
      }
      if (char === "'") state = "single";
      if (char === '"') state = "double";
      if (char === "`") state = "template";
      output += char;
      continue;
    }

    output += char;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (state === "single" && char === "'") state = "normal";
    if (state === "double" && char === '"') state = "normal";
    if (state === "template" && char === "`") state = "normal";
  }

  return output;
}

function lineForIndex(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function directBackendApiRouteLiterals(): string[] {
  const violations: string[] = [];

  for (const file of sourceFiles(SRC_DIR)) {
    const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
    if (ALLOWED_ROUTE_LITERAL_FILES.has(relative)) continue;

    const source = stripJsLikeComments(readFileSync(file, "utf8"));
    DIRECT_BACKEND_API_ROUTE_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = DIRECT_BACKEND_API_ROUTE_PATTERN.exec(source))) {
      violations.push(`${relative}:${lineForIndex(source, match.index)}`);
    }
  }

  return violations;
}

describe("public backend API URL usage", () => {
  it("keeps backend route literals centralized in URL builders and cache policy", () => {
    expect(directBackendApiRouteLiterals()).toEqual([]);
  });
});
