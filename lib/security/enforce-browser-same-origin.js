import {
  crossOriginRequestResponse,
  isCrossOriginRequest,
} from "./same-origin-request.js";

/**
 * Defense-in-depth for cookie-authenticated browser mutations.
 * Returns a 403 response when Origin is present and does not match Host.
 */
export function rejectCrossOriginBrowserRequest(request) {
  if (isCrossOriginRequest(request)) {
    return crossOriginRequestResponse();
  }

  return null;
}
