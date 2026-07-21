import assert from "node:assert/strict";
import {
  ADMIN_COMMAND_USER_RESULT_LIMIT,
  ADMIN_COMMAND_USER_SEARCH_MIN_CHARS,
  buildUserCommandItems,
  filterStaticCommandItems,
  groupCommandResults,
  shouldIgnoreCommandPaletteShortcut,
} from "../lib/admin-command-palette-helpers.js";

function testFilterStaticCommands() {
  const all = filterStaticCommandItems("");
  assert.ok(all.length >= 10);

  const users = filterStaticCommandItems("مستخدم");
  assert.ok(users.some((item) => item.id === "nav-user-management"));

  const vip = filterStaticCommandItems("vip");
  assert.ok(vip.some((item) => item.tab === "vip" || item.id === "action-vip"));
}

function testBuildUserCommandItemsLimit() {
  const items = buildUserCommandItems(
    Array.from({ length: 10 }, (_, index) => ({
      id: `user-${index}`,
      username: `User ${index}`,
      email: `user${index}@example.com`,
      accountStatus: "active",
      accountStatusLabel: "نشط",
    }))
  );

  assert.equal(items.length, ADMIN_COMMAND_USER_RESULT_LIMIT);
  assert.equal(items[0].group, "users");
}

function testGroupCommandResults() {
  const grouped = groupCommandResults([
    { id: "nav-overview", group: "navigation", label: "الرئيسية" },
    { id: "user:1", group: "users", label: "User" },
    { id: "action-refresh", group: "actions", label: "تحديث" },
  ]);

  assert.deepEqual(
    grouped.map((group) => group.id),
    ["navigation", "users", "actions"]
  );
}

function testShortcutIgnoreInputs() {
  assert.equal(shouldIgnoreCommandPaletteShortcut({ tagName: "INPUT" }), true);
  assert.equal(shouldIgnoreCommandPaletteShortcut({ tagName: "DIV" }), false);
}

function testSearchMinCharsConstant() {
  assert.equal(ADMIN_COMMAND_USER_SEARCH_MIN_CHARS, 2);
}

const tests = [
  ["filter static commands", testFilterStaticCommands],
  ["limit user command items", testBuildUserCommandItemsLimit],
  ["group command results", testGroupCommandResults],
  ["ignore shortcut in inputs", testShortcutIgnoreInputs],
  ["search min chars", testSearchMinCharsConstant],
];

let passed = 0;

for (const [name, runner] of tests) {
  runner();
  passed += 1;
  console.log(`✅ ${name}`);
}

console.log(`\n${passed}/${tests.length} admin command palette tests passed`);
