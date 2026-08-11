import {
  resolveLastLoginDateBounds,
  resolveRegistrationDateBounds,
} from "./admin-user-registration-cohorts.js";
import {
  EXPIRED_SUBSCRIPTION_FILTER,
  resolveExpiredServerActiveServiceFilter,
} from "./admin-user-subscription-state.js";

export const DEFAULT_ADMIN_USER_CLIENT_FILTERS = {
  service: "all",
  plan: "",
  status: "all",
  registeredFrom: "",
  registeredTo: "",
  lastLoginFrom: "",
  lastLoginTo: "",
  subscriptionState: "all",
  userClassification: "all",
};

export function resolveServerActiveServiceFilter(clientFilters = {}) {
  const { service = "all", subscriptionState = "all" } = clientFilters;
  if (subscriptionState === EXPIRED_SUBSCRIPTION_FILTER || subscriptionState === "expired") {
    return resolveExpiredServerActiveServiceFilter(service);
  }
  if (subscriptionState === "active_vip" && service === "vip") return "vip";
  if (subscriptionState === "active_am" && service === "account_management") return "account_management";
  if (subscriptionState === "active_alerts" && service === "alerts") return "alerts";
  if (service !== "all") return service;
  return "";
}

export function buildAdminUserListRequestParams({
  page = 1,
  pageSize = 25,
  searchQuery = "",
  sort = "created_at",
  order = "desc",
  accountStatusFilter = "all",
  clientFilters = DEFAULT_ADMIN_USER_CLIENT_FILTERS,
  registrationCohort = "",
  effectiveAccountStatusFilter = "all",
} = {}) {
  const registrationBounds = resolveRegistrationDateBounds({
    cohort: registrationCohort,
    registeredFrom: clientFilters.registeredFrom,
    registeredTo: clientFilters.registeredTo,
  });
  const lastLoginBounds = resolveLastLoginDateBounds({
    lastLoginFrom: clientFilters.lastLoginFrom,
    lastLoginTo: clientFilters.lastLoginTo,
  });

  return {
    page,
    pageSize,
    listAll: false,
    search: searchQuery,
    sort,
    order,
    accountStatus: effectiveAccountStatusFilter,
    activeService: resolveServerActiveServiceFilter(clientFilters),
    registeredFrom: registrationBounds.registeredFromIso,
    registeredTo: registrationBounds.registeredToIso,
    lastLoginFrom: lastLoginBounds.lastLoginFromIso,
    lastLoginTo: lastLoginBounds.lastLoginToIso,
    plan: String(clientFilters.plan || "").trim(),
    userClassification: String(clientFilters.userClassification || "all").trim().toLowerCase(),
  };
}
