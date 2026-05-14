const shared = window.WeiboFilterShared;
const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;

const HIDDEN_FLAG = "weiboHotFilterHidden";
const PREV_DISPLAY_FLAG = "weiboHotFilterPrevDisplay";
const MATCH_FLAG = "weiboHotFilterMatched";
const TEXT_CACHE_FLAG = "weiboHotFilterTextCache";
const SETTINGS_CACHE_FLAG = "weiboHotFilterSettingsCache";

let settingsCache = { ...DEFAULT_SETTINGS };
let matcherCache = [];
let scanTimer = null;
let currentUrl = location.href;

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => resolve(settings));
  });
}

function getCombinedPatterns() {
  return shared.mergeUniquePatterns(settingsCache.patterns || [], settingsCache.remotePatterns || []);
}

function refreshMatchers() {
  matcherCache = shared.buildMatchers(getCombinedPatterns());
}

function isHotPage() {
  return (
    location.hostname === "s.weibo.com" &&
    (location.pathname.startsWith("/top/summary") || location.pathname.startsWith("/top"))
  );
}

function getSettingsSignature() {
  return JSON.stringify({
    enabled: settingsCache.enabled,
    patterns: settingsCache.patterns,
    remotePatterns: settingsCache.remotePatterns
  });
}

function getHotRows() {
  const selectors = [
    "#pl_top_realtimehot table tbody tr",
    ".m-table table tbody tr",
    ".main-full table tbody tr"
  ];

  for (const selector of selectors) {
    const rows = Array.from(document.querySelectorAll(selector));
    if (rows.length) {
      return rows;
    }
  }

  return [];
}

function getRowText(row) {
  const keywordAnchor = row.querySelector("td.td-02 a");
  if (keywordAnchor) {
    return keywordAnchor.textContent || "";
  }

  const anchor = row.querySelector("a");
  if (anchor) {
    return anchor.textContent || "";
  }

  return row.textContent || "";
}

function setHidden(row, hidden) {
  if (hidden) {
    if (row.dataset[HIDDEN_FLAG] === "1") {
      return;
    }

    row.dataset[PREV_DISPLAY_FLAG] = row.style.display || "";
    row.style.display = "none";
    row.dataset[HIDDEN_FLAG] = "1";
    return;
  }

  if (row.dataset[HIDDEN_FLAG] !== "1") {
    return;
  }

  row.style.display = row.dataset[PREV_DISPLAY_FLAG] || "";
  delete row.dataset[PREV_DISPLAY_FLAG];
  delete row.dataset[HIDDEN_FLAG];
}

function shouldHideRow(row) {
  const text = getRowText(row).trim();
  const normalizedText = shared.normalizeText(text).slice(0, 320);
  const settingsSignature = getSettingsSignature();

  if (
    row.dataset[TEXT_CACHE_FLAG] === normalizedText &&
    row.dataset[SETTINGS_CACHE_FLAG] === settingsSignature
  ) {
    return row.dataset[MATCH_FLAG] === "1";
  }

  const matched = text ? shared.shouldHideText(text, matcherCache, settingsCache.enabled) : false;
  row.dataset[TEXT_CACHE_FLAG] = normalizedText;
  row.dataset[SETTINGS_CACHE_FLAG] = settingsSignature;
  row.dataset[MATCH_FLAG] = matched ? "1" : "0";
  return matched;
}

function scanHotList() {
  const rows = getHotRows();
  if (!rows.length) {
    return;
  }

  if (!isHotPage()) {
    rows.forEach((row) => setHidden(row, false));
    return;
  }

  rows.forEach((row) => {
    setHidden(row, shouldHideRow(row));
  });
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scanHotList, 120);
}

function monitorRouteChange() {
  if (location.href === currentUrl) {
    return;
  }

  currentUrl = location.href;
  scheduleScan();
}

async function init() {
  settingsCache = await getSettings();
  refreshMatchers();
  scanHotList();

  const observer = new MutationObserver(() => {
    monitorRouteChange();
    scheduleScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    settingsCache = {
      ...settingsCache,
      ...Object.fromEntries(
        Object.entries(changes).map(([key, change]) => [key, change.newValue])
      )
    };
    refreshMatchers();
    scheduleScan();
  });

}

init();
