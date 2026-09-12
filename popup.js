const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const toggleBtn = document.getElementById("toggleBtn");
const downloadBtn = document.getElementById("downloadBtn");
const zipBtn = document.getElementById("zipBtn");
const clearBtn = document.getElementById("clearBtn");
const skipEmptyClicksToggle = document.getElementById("skipEmptyClicksToggle");
const highlightStyleSelect = document.getElementById("highlightStyleSelect");
const screenshotFrameSelect = document.getElementById("screenshotFrameSelect");

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const count = state.screenshots.length;

  toggleBtn.textContent = state.recording ? "Stop Recording" : "Start Recording";
  toggleBtn.classList.toggle("recording", state.recording);
  statusEl.textContent = state.recording
    ? "Recording — click anywhere on the page"
    : "Not recording";
  countEl.textContent = `${count} screenshot(s) captured`;
  downloadBtn.disabled = count === 0;
  zipBtn.disabled = count === 0;
  clearBtn.disabled = count === 0;

  const { skipEmptyClicks, highlightStyle, screenshotFrame } = await chrome.storage.local.get({
    skipEmptyClicks: true,
    highlightStyle: "none",
    screenshotFrame: "shadow",
  });
  skipEmptyClicksToggle.checked = skipEmptyClicks;
  highlightStyleSelect.value = highlightStyle;
  screenshotFrameSelect.value = screenshotFrame;
}

skipEmptyClicksToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ skipEmptyClicks: skipEmptyClicksToggle.checked });
});

highlightStyleSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ highlightStyle: highlightStyleSelect.value });
});

screenshotFrameSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ screenshotFrame: screenshotFrameSelect.value });
});

toggleBtn.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });

  if (state.recording) {
    await chrome.runtime.sendMessage({ type: "STOP_RECORDING" });
  } else {
    await chrome.runtime.sendMessage({ type: "START_RECORDING" });
  }

  refresh();
});

clearBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "CLEAR_SCREENSHOTS" });
  refresh();
});

downloadBtn.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const shots = state.screenshots;
  if (!shots.length) return;

  const body = shots
    .map((s, i) => {
      const pageBreak = i > 0 ? "page-break-before: always;" : "";
      return `
        <div style="${pageBreak} text-align: center;">
          <img src="${s.dataUrl}" width="672" height="384" style="width:7in; height:4in;" />
        </div>`;
    })
    .join("\n");

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>ClickScribe Recording</title>
</head>
<body>
${body}
</body>
</html>`;

  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const filename = `clickscribe-${Date.now()}.doc`;

  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
});

zipBtn.addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const shots = state.screenshots;
  if (!shots.length) return;

  const padWidth = Math.max(2, String(shots.length).length);
  const files = shots.map((s, i) => ({
    name: `screenshot-${String(i + 1).padStart(padWidth, "0")}.png`,
    data: dataUrlToBytes(s.dataUrl),
  }));

  const blob = buildZip(files);
  const url = URL.createObjectURL(blob);
  const filename = `clickscribe-${Date.now()}.zip`;

  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
});

document.addEventListener("DOMContentLoaded", refresh);
refresh();
