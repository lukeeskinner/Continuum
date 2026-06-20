// Capture surface admission policy — port of FNDR's
// src-tauri/src/capture/admission.rs.
//
// Classifies the frontmost window/app *before* a frame is sent for (costly)
// vision inference + OCR, so generic or low-value surfaces (new-tab pages,
// search results, feeds) are skipped or downgraded entirely.
//
// FNDR has macOS Accessibility access to the active browser tab's URL;
// Continuum's desktop agent does not (yet) read URLs, so this port works off
// the active window/app title only and degrades the URL-driven listing
// checks accordingly.

const NORMAL = "Normal";
const URL_ONLY = "UrlOnly";
const SKIP_FRAME = "SkipFrame";

const BROWSER_APPS = /chrome|safari|firefox|edge|brave|arc|opera/i;

const GENERIC_PAGE_TITLES = [
  /new tab/i,
  /start page/i,
  /speed dial/i,
  /^blank$/i,
  /^untitled$/i,
];

const NAV_TITLE_PATTERNS = [
  /search results?/i,
  /\bfeed\b/i,
  /\bexplore\b/i,
  /\bdiscover\b/i,
  /\btrending\b/i,
  /\bhashtag\b/i,
];

const LISTING_TITLE_PATTERNS = [/\bvideos\b/i, /\bplaylists?\b/i, /\bposts\b/i, /\breels\b/i];

// classify({ appName, windowTitle }) -> "Normal" | "UrlOnly" | "SkipFrame"
function classifyCaptureSurfacePolicy({ appName = "", windowTitle = "" } = {}) {
  if (!BROWSER_APPS.test(appName)) return NORMAL;
  if (!windowTitle) return NORMAL;

  if (GENERIC_PAGE_TITLES.some((re) => re.test(windowTitle))) return SKIP_FRAME;
  if (NAV_TITLE_PATTERNS.some((re) => re.test(windowTitle))) return SKIP_FRAME;
  if (LISTING_TITLE_PATTERNS.some((re) => re.test(windowTitle))) return URL_ONLY;

  return NORMAL;
}

module.exports = {
  NORMAL,
  URL_ONLY,
  SKIP_FRAME,
  classifyCaptureSurfacePolicy,
};
