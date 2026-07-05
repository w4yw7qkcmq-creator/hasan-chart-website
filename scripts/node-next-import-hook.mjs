import { accessSync } from "node:fs";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function fileExists(path) {
  try {
    accessSync(path);
    return true;
  } catch {
    return false;
  }
}

function resolveWithExtensions(basePath) {
  if (extname(basePath)) {
    return fileExists(basePath) ? basePath : null;
  }

  for (const suffix of [".js", ".mjs", ".json"]) {
    const candidate = `${basePath}${suffix}`;
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();

  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const parentDir = dirname(parentPath);
    const absolute = resolvePath(parentDir, specifier);
    const resolved = resolveWithExtensions(absolute);

    if (resolved) {
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      };
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("node:")) {
      const fromParent = resolvePath(dirname(parentPath), `${specifier}.js`);

      if (fileExists(fromParent)) {
        return {
          url: pathToFileURL(fromParent).href,
          shortCircuit: true,
        };
      }
    }

    throw error;
  }
}
