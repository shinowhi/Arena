// ESM resolve hooks: map extensionless relative imports to .ts sources so
// plain node can import repo modules written in the extensionless style
// (paper-generator, revenge, boss-generator, ...). No build step, no deps.
// Registered from offline tests via node:module register(); never imported
// by app code.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    for (const suffix of [".ts", "/index.ts"]) {
      try {
        const candidate = new URL(specifier + suffix, context.parentURL);
        if (candidate.protocol === "file:" && existsSync(fileURLToPath(candidate))) {
          return next(candidate.href, context);
        }
      } catch {
        // Fall through to default resolution.
      }
    }
  }
  return next(specifier, context);
}
