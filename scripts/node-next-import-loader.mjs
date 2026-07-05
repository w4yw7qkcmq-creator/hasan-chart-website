import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
register(join(__dirname, "node-next-import-hook.mjs"), pathToFileURL("./"));
