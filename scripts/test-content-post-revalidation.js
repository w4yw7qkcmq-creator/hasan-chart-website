#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

const admin = read("lib/content-posts-admin.js");
const revalidation = read("lib/content-post-revalidation.js");

assert.match(revalidation, /paths\.add\("\/academy"\)/);
assert.match(revalidation, /paths\.add\("\/results"\)/);
assert.match(revalidation, /revalidatePath\(path\)/);
assert.match(admin, /revalidateContentPostPages/);
assert.match(admin, /content_post.create/);
assert.match(admin, /content_post.publish/);
assert.match(admin, /content_post.archive/);
assert.match(admin, /content_post.soft_delete/);

console.log("test-content-post-revalidation: PASS");
