export function shouldBlockDuplicateAdminAction({ inFlight = false, actionLoading = "" } = {}) {
  return Boolean(inFlight || actionLoading);
}

export function isSuccessfulAdminActionResponse(response, result = {}) {
  if (!response || response.status === 401 || response.status === 403 || response.status === 503) {
    return false;
  }
  if (!response.ok) return false;
  if (result.success === false || result.ok === false) return false;
  if (
    typeof result.error === "string" &&
    result.error.trim() &&
    result.success !== true &&
    result.ok !== true
  ) {
    return false;
  }
  return true;
}

export function resolveAdminActionToastOutcome({ actionSucceeded, actionErrorMessage = "" }) {
  if (actionSucceeded) {
    return {
      type: "success",
      title: "تم التنفيذ",
      body: "اكتمل الإجراء بنجاح",
    };
  }

  return {
    type: "error",
    title: "فشل الإجراء",
    body: actionErrorMessage || "تعذر تنفيذ العملية",
  };
}

export async function runIsolatedPostActionRefresh(refreshTask) {
  try {
    await refreshTask();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || String(error),
    };
  }
}
