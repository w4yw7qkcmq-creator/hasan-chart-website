/** @typedef {Object} IamContext
 * @property {string|null} userId
 * @property {string} email
 * @property {string} organizationId
 * @property {string[]} roleIds
 * @property {string[]} roleLabels
 * @property {string|null} primaryRoleId
 * @property {string|null} primaryRoleLabel
 * @property {Set<string>} permissions
 * @property {Set<string>} allowPermissions
 * @property {Set<string>} denyPermissions
 * @property {boolean} isAdmin
 * @property {boolean} isSuperAdmin
 * @property {'none'|'iam'|'legacy'|'dual'} source
 * @property {string|null} legacyProfileRole
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
