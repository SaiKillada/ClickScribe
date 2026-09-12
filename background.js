// Central state lives in chrome.storage.local (not in-memory variables),
// because MV3 service workers can be killed and restarted between messages.
//
// Recording is global (not tied to a single tab): once started, a click in
// ANY tab/window triggers a screenshot of whichever tab is active in that
// window at the time. This gives multi-tab support for free, since
// chrome.tabs.captureVisibleTab already captures per-window.

async function getState() {
  const { recording = false, screenshots = [] } =
    await chrome.storage.local.get(["recording", "screenshots"]);
  return { recording, screenshots };
}

async function startRecording() {
  await chrome.storage.local.set({ recording: true, screenshots: [] });
  await chrome.action.setBadgeText({ text: "REC" });
  await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
}

async function stopRecording() {
  await chrome.storage.local.set({ recording: false });
  await chrome.action.setBadgeText({ text: "" });
}

async function addScreenshot(shot) {
  const { screenshots } = await getState();
  screenshots.push(shot);
  await chrome.storage.local.set({ screenshots });
}

// Fallback marker size (CSS px) used when there's no usable element rect.
const FALLBACK_MARKER_HALF_SIZE = 24;
// Breathing room (CSS px) added around a highlighted element's real bounds.
const HIGHLIGHT_PADDING = 5;
const HIGHLIGHT_CORNER_RADIUS = 8;

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function traceRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Each dropdown value maps to a line style plus a color. "solid-yellow" is
// the same "solid" stroke logic as "solid", just a different color.
const HIGHLIGHT_PRESETS = {
  dashed: { lineStyle: "dashed", color: "#e8281c" },
  dotted: { lineStyle: "dotted", color: "#e8281c" },
  solid: { lineStyle: "solid", color: "#e8281c" },
  double: { lineStyle: "double", color: "#e8281c" },
  "solid-yellow": { lineStyle: "solid", color: "#f2c200" },
};

// Paints the highlight border for a given preset onto a rounded rect path
// already positioned at (x, y, w, h). "double" draws two concentric strokes
// since a single stroke can't represent it. "dotted" abuses setLineDash with
// a near-zero dash + round caps, the standard canvas trick for round dots.
function strokeHighlight(ctx, x, y, w, h, radius, preset, dpr) {
  const { lineStyle, color } = preset;
  const lineWidth = Math.max(2, Math.round(2.5 * dpr));

  if (lineStyle === "double") {
    const gap = Math.max(3, Math.round(3 * dpr));
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr));
    ctx.strokeStyle = color;
    traceRoundedRect(ctx, x - gap, y - gap, w + gap * 2, h + gap * 2, radius + gap);
    ctx.stroke();
    traceRoundedRect(ctx, x + gap, y + gap, Math.max(0, w - gap * 2), Math.max(0, h - gap * 2), Math.max(0, radius - gap));
    ctx.stroke();
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = lineStyle === "dotted" ? "round" : "butt";
  switch (lineStyle) {
    case "dotted":
      ctx.setLineDash([0.1, lineWidth * 2]);
      break;
    case "solid":
      ctx.setLineDash([]);
      break;
    case "dashed":
    default:
      ctx.setLineDash([9, 6]);
      break;
  }
  traceRoundedRect(ctx, x, y, w, h, radius);
  ctx.stroke();
}

// Frame presets for decorating the whole screenshot (as opposed to
// highlighting the click point). Sizes are in CSS px and get scaled by
// devicePixelRatio, same as the click highlight, so the frame looks
// proportionally the same regardless of the page's pixel density. Padding
// can be asymmetric (e.g. polaroid's deep bottom margin); shadow/border are
// each optional so a preset can use either, both, or neither.
const FRAME_PRESETS = {
  shadow: {
    padding: { top: 28, right: 28, bottom: 28, left: 28 },
    radiusCss: 14,
    backgroundColor: "#ffffff",
    shadow: { blurCss: 22, offsetYCss: 10, color: "rgba(0, 0, 0, 0.32)" },
  },
  border: {
    padding: { top: 14, right: 14, bottom: 14, left: 14 },
    radiusCss: 10,
    backgroundColor: "#ffffff",
    border: { widthCss: 2, color: "#c9c9c9" },
  },
  polaroid: {
    padding: { top: 20, right: 20, bottom: 64, left: 20 },
    radiusCss: 4,
    backgroundColor: "#ffffff",
    shadow: { blurCss: 18, offsetYCss: 8, color: "rgba(0, 0, 0, 0.28)" },
  },
  rounded: {
    padding: { top: 16, right: 16, bottom: 16, left: 16 },
    radiusCss: 22,
    backgroundColor: "#ffffff",
    shadow: { blurCss: 12, offsetYCss: 4, color: "rgba(0, 0, 0, 0.18)" },
  },
  // Material Design-style card elevation: a tight, dark "key light" shadow
  // hugging the edge plus a larger, softer "ambient" shadow further out —
  // layering two shadows (instead of one uniform blur) is what makes a card
  // read as lifted off the page rather than just blurred at the edges.
  elevated: {
    padding: { top: 20, right: 24, bottom: 34, left: 24 },
    radiusCss: 10,
    backgroundColor: "#ffffff",
    shadows: [
      { blurCss: 5, offsetYCss: 2, color: "rgba(0, 0, 0, 0.22)" },
      { blurCss: 20, offsetYCss: 12, color: "rgba(0, 0, 0, 0.16)" },
    ],
  },
};

// Wraps a screenshot in a decorative "card": adds padding, optionally casts
// a blurred drop shadow behind a filled rounded rect, draws the (rounded-
// corner clipped) screenshot on top, then optionally strokes a border over
// the edge. Baked into the pixels so it renders identically in the Word
// doc, the ZIP, anywhere — no dependency on box-shadow/border-radius
// support in whatever eventually opens the file.
async function frameScreenshot(dataUrl, devicePixelRatio, frameStyle) {
  const preset = FRAME_PRESETS[frameStyle];
  if (!preset) return dataUrl;

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);

    const dpr = devicePixelRatio || 1;
    const padTop = Math.round(preset.padding.top * dpr);
    const padRight = Math.round(preset.padding.right * dpr);
    const padBottom = Math.round(preset.padding.bottom * dpr);
    const padLeft = Math.round(preset.padding.left * dpr);
    const radius = Math.round(preset.radiusCss * dpr);

    const canvas = new OffscreenCanvas(bitmap.width + padLeft + padRight, bitmap.height + padTop + padBottom);
    const ctx = canvas.getContext("2d");

    // Each shadow layer needs its own fill pass — canvas only casts one
    // shadow per draw call — so multiple layers are drawn back to back,
    // each re-covering the previous pass's opaque rect but leaving its
    // blurred shadow visible around the edges underneath.
    const shadowLayers = preset.shadows || (preset.shadow ? [preset.shadow] : []);
    ctx.save();
    if (shadowLayers.length === 0) {
      ctx.fillStyle = preset.backgroundColor;
      traceRoundedRect(ctx, padLeft, padTop, bitmap.width, bitmap.height, radius);
      ctx.fill();
    } else {
      for (const layer of shadowLayers) {
        ctx.save();
        ctx.shadowColor = layer.color;
        ctx.shadowBlur = Math.round(layer.blurCss * dpr);
        ctx.shadowOffsetX = Math.round((layer.offsetXCss || 0) * dpr);
        ctx.shadowOffsetY = Math.round(layer.offsetYCss * dpr);
        ctx.fillStyle = preset.backgroundColor;
        traceRoundedRect(ctx, padLeft, padTop, bitmap.width, bitmap.height, radius);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();

    ctx.save();
    traceRoundedRect(ctx, padLeft, padTop, bitmap.width, bitmap.height, radius);
    ctx.clip();
    ctx.drawImage(bitmap, padLeft, padTop);
    ctx.restore();

    if (preset.border) {
      ctx.save();
      ctx.lineWidth = Math.round(preset.border.widthCss * dpr);
      ctx.strokeStyle = preset.border.color;
      traceRoundedRect(ctx, padLeft, padTop, bitmap.width, bitmap.height, radius);
      ctx.stroke();
      ctx.restore();
    }

    const outBlob = await canvas.convertToBlob({ type: "image/png" });
    const buffer = await outBlob.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
  } catch (err) {
    console.warn("ClickScribe: framing screenshot failed", err);
    return dataUrl;
  }
}

// Draws a highlight around the clicked element (or a small marker at the
// click point if no sensible element bounds are known) so the exported
// screenshot makes clear what was clicked. `highlightStyle` is a key into
// HIGHLIGHT_PRESETS — callers should skip calling this entirely for "none".
async function markClickSpot(dataUrl, msg, highlightStyle) {
  const preset = HIGHLIGHT_PRESETS[highlightStyle] || HIGHLIGHT_PRESETS.dashed;
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);

    const dpr = msg.devicePixelRatio || 1;
    const rect = msg.rect;
    // Ignore element rects so large they'd cover most of the viewport
    // (e.g. clicking a full-width section) — a small marker reads better.
    const rectIsReasonable =
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      (!msg.viewportWidth || rect.width < msg.viewportWidth * 0.8) &&
      (!msg.viewportHeight || rect.height < msg.viewportHeight * 0.6);

    let x, y, w, h, radius;
    if (rectIsReasonable) {
      x = (rect.left - HIGHLIGHT_PADDING) * dpr;
      y = (rect.top - HIGHLIGHT_PADDING) * dpr;
      w = (rect.width + HIGHLIGHT_PADDING * 2) * dpr;
      h = (rect.height + HIGHLIGHT_PADDING * 2) * dpr;
      radius = HIGHLIGHT_CORNER_RADIUS * dpr;
    } else {
      const half = FALLBACK_MARKER_HALF_SIZE * dpr;
      x = msg.x * dpr - half;
      y = msg.y * dpr - half;
      w = half * 2;
      h = half * 2;
      radius = half;
    }

    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(canvas.width - x, w);
    h = Math.min(canvas.height - y, h);

    traceRoundedRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = hexToRgba(preset.color, 0.14);
    ctx.fill();

    strokeHighlight(ctx, x, y, w, h, radius, preset, dpr);

    const outBlob = await canvas.convertToBlob({ type: "image/png" });
    const buffer = await outBlob.arrayBuffer();
    return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
  } catch (err) {
    console.warn("ClickScribe: marking click spot failed", err);
    return dataUrl;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_RECORDING") {
    startRecording().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "STOP_RECORDING") {
    stopRecording().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "CLEAR_SCREENSHOTS") {
    chrome.storage.local.set({ screenshots: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }

  if (msg.type === "CLICK_CAPTURED") {
    const tab = sender.tab;
    if (tab) {
      enqueueClick(msg, tab).then(() => sendResponse({ ok: true }));
    }
    return true;
  }
});

// Chrome throttles chrome.tabs.captureVisibleTab to roughly 2 calls/second
// per extension (across ALL tabs/windows). Clicking faster than that used to
// silently drop screenshots (the error was only console.warn'd) and, worse,
// concurrent handlers could race on the read-modify-write to storage and
// clobber each other's writes. Both are fixed by processing every click
// through one serial queue: only one capture/store cycle runs at a time, and
// each one waits out the rate limit before calling captureVisibleTab.
let clickQueue = Promise.resolve();
let lastCaptureAt = 0;
const MIN_CAPTURE_INTERVAL_MS = 600;

function enqueueClick(msg, tab) {
  clickQueue = clickQueue.then(() => processClick(msg, tab));
  return clickQueue;
}

async function processClick(msg, tab) {
  const state = await getState();
  if (!state.recording) return;

  const wait = lastCaptureAt + MIN_CAPTURE_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

  try {
    const rawDataUrl = await captureWithRetry(tab.windowId);
    lastCaptureAt = Date.now();

    const { highlightStyle = "none", screenshotFrame = "shadow" } = await chrome.storage.local.get({
      highlightStyle: "none",
      screenshotFrame: "shadow",
    });

    const highlightedDataUrl =
      highlightStyle === "none" ? rawDataUrl : await markClickSpot(rawDataUrl, msg, highlightStyle);
    const dataUrl =
      screenshotFrame === "none"
        ? highlightedDataUrl
        : await frameScreenshot(highlightedDataUrl, msg.devicePixelRatio, screenshotFrame);

    await addScreenshot({
      id: crypto.randomUUID(),
      dataUrl,
      timestamp: msg.timestamp,
      tabId: tab.id,
      url: msg.url,
      title: msg.title,
      x: msg.x,
      y: msg.y,
      targetTag: msg.targetTag,
      targetText: msg.targetText,
    });
  } catch (err) {
    console.warn("ClickScribe: capture failed", err);
  }
}

async function captureWithRetry(windowId, attempt = 0) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  } catch (err) {
    const isQuotaError = /quota|MAX_CAPTURE/i.test(err && err.message ? err.message : "");
    if (isQuotaError && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return captureWithRetry(windowId, attempt + 1);
    }
    throw err;
  }
}
