import assert from "node:assert/strict";
import {
  ADMIN_NOTES_TABLE_MISSING_MESSAGE,
  buildUnavailableSectionPayload,
  isTechnicalAdminError,
} from "../lib/admin-user-management-shared.js";
import { ADMIN_COMMAND_NAV_ITEMS } from "../lib/admin-command-palette-helpers.js";

function testCommandPaletteRoutes() {
  const users = ADMIN_COMMAND_NAV_ITEMS.find((item) => item.id === "nav-user-management");
  const finance = ADMIN_COMMAND_NAV_ITEMS.find((item) => item.id === "nav-financial-center");

  assert.equal(users.href, "/admin/users");
  assert.equal(finance.href, "/admin/financial-center");
  assert.equal(users.tab, undefined);
  assert.equal(finance.tab, undefined);
}

function testNotesMissingTablePayload() {
  const payload = buildUnavailableSectionPayload("notes", 1);
  assert.equal(payload.available, false);
  assert.equal(payload.message, ADMIN_NOTES_TABLE_MISSING_MESSAGE);
  assert.equal(Array.isArray(payload.notes), true);
}

function testMissingTableSanitization() {
  assert.equal(
    isTechnicalAdminError('Could not find table public.admin_user_notes in the schema cache'),
    true
  );
}

const tests = [
  ["command palette standalone routes", testCommandPaletteRoutes],
  ["notes missing-table payload", testNotesMissingTablePayload],
  ["missing table sanitization", testMissingTableSanitization],
];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} admin standalone route tests passed`);
