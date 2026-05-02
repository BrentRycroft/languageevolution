/**
 * Centralized z-index scale. Mirror of the --z-* CSS variables in
 * src/styles/tokens.css. Components prefer numeric values for inline styles
 * so React can type-check the prop, but the values are kept in lockstep
 * with the stylesheet so any rule change here applies app-wide.
 *
 * Tiers:
 *   overlay        in-panel overlays (e.g. map control box)
 *   banner         in-page banners (onboarding, notices)
 *   dropdown       selects + autocomplete dropdowns
 *   modal          full modal dialogs
 *   modalElevated  nested editors above a modal
 *   toast          toasts / persistent notifications
 */
export const Z = {
  overlay: 5,
  banner: 10,
  dropdown: 50,
  modal: 100,
  modalElevated: 200,
  toast: 1000,
} as const;

export type ZIndexTier = keyof typeof Z;
