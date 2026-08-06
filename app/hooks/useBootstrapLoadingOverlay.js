"use client"; /** * Bootstrap loading overlay — temporarily disabled. * Site content always renders; no timeout banners. */
export function useBootstrapLoadingOverlay(
  _authResolved,
  { enabled: _enabled = true } = {},
) {
  return {
    overlay: null,
    stallBanner: null,
    overlayState: "hidden",
    isLoadingVisible: false,
  };
}
