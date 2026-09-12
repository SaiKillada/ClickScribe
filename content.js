// Runs on every page. Has no idea whether recording is on — it just reports
// clicks and lets the background service worker decide what to do with them.
// This keeps it stateless, so it works the same after reloads/navigations
// without needing to be re-injected or re-configured.

// Heuristic for "this click probably does something": a known interactive
// tag/role/attribute, or an element styled with a pointer cursor (the
// conventional signal for "this is clickable" even on custom widgets). This
// can't know about click handlers with no visual affordance, but it filters
// out the vast majority of empty-space/no-op clicks.
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "option",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  "[onclick]",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(", ");

function looksInteractive(target) {
  if (!target) return false;
  if (target.closest(INTERACTIVE_SELECTOR)) return true;
  try {
    return getComputedStyle(target).cursor === "pointer";
  } catch (err) {
    return false;
  }
}

let skipEmptyClicks = true;

chrome.storage.local.get({ skipEmptyClicks: true }).then((res) => {
  skipEmptyClicks = res.skipEmptyClicks;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "skipEmptyClicks" in changes) {
    skipEmptyClicks = changes.skipEmptyClicks.newValue;
  }
});

document.addEventListener(
  "click",
  (event) => {
    const target = event.target instanceof Element ? event.target : null;

    if (skipEmptyClicks && !looksInteractive(target)) {
      return;
    }

    const rect = target ? target.getBoundingClientRect() : null;

    try {
      chrome.runtime.sendMessage({
        type: "CLICK_CAPTURED",
        x: event.clientX,
        y: event.clientY,
        pageX: event.pageX,
        pageY: event.pageY,
        rect:
          rect && rect.width > 0 && rect.height > 0
            ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
            : null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        targetTag: target ? target.tagName.toLowerCase() : null,
        targetText: target && target.textContent ? target.textContent.trim().slice(0, 80) : "",
        url: location.href,
        title: document.title,
        timestamp: Date.now(),
        devicePixelRatio: window.devicePixelRatio || 1,
      });
    } catch (err) {
      // Extension context can be invalidated (e.g. extension reloaded) while
      // an old content script instance is still attached. Nothing to do.
    }
  },
  true
);
