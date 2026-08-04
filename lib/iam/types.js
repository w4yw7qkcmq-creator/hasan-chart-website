/** @typedef {Object} IamContext
 * @property {string|null} userId
 * @property {string} email
 * @property {string} organizationId
 * @property {string[]} roleIds
 * @property {string[]} roleLabels
 * @property {string[]} assignmentIds
 * @property {boolean} hasActiveAssignment
 * @property {string|null} primaryRoleId
 * @property {string|null} primaryRoleLabel
 * @property {Set<string>} permissions
 * @property {Set<string>} allowPermissions
 * @property {Set<string>} denyPermissions
 * @property {boolean} isAdmin
 * @property {boolean} isSuperAdmin
 * @property {'none'|'iam'|'iam_with_overrides'|'legacy'|'dual'|'legacy_blocked'} source
 * @property {string|null} legacyProfileRole
 * @property {boolean} legacyDetected
 * @property {string|null} legacyRole
 * @property {boolean} legacyIsFallback
 * @property {boolean} tableMissing
 * @property {string|null} resolverError
 */

/** @typedef {Object} AdminSessionResult
 * @property {boolean} ok
 * @property {number} [status]
 * @property {string} [error]
 * @property {import('@supabase/supabase-js').User} [user]
 * @property {import('@supabase/supabase-js').SupabaseClient} [supabase]
 * @property {IamContext} [iam]
 * @property {'user'|'service'} [actorType]
 * @property {string} [serviceAccountId]
 */

export {};
