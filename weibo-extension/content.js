const DEFAULT_SETTINGS = {
  enabled: true,
  patterns: ["广告"]
};

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

function normalizeText(value) {
  return (value || "")
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function buildMatchers(patterns) {
  return patterns
    .map((pattern) => {
      const trimmed = (pattern || "").trim();
      if (!trimmed) {
        return null;
      }

      const normalized = normalizeText(trimmed);
      if (!normalized) {
        return null;
      }

      return {
        rawLower: trimmed.toLocaleLowerCase().normalize("NFKC"),
        normalized
      };
    })
    .filter(Boolean);
}

function shouldHideText(rawText) {
  if (!settingsCache.enabled || !matcherCache.length) {
    return false;
  }

  const raw = rawText || "";
  if (!raw.trim()) {
    return false;
  }

  const rawComparable = raw.toLocaleLowerCase().normalize("NFKC");
  const normalizedText = normalizeText(raw).slice(0, 320);

  return matcherCache.some((matcher) => {
    if (matcher.rawLower && rawComparable.includes(matcher.rawLower)) {
      return true;
    }

    return Boolean(normalizedText) && normalizedText.includes(matcher.normalized);
  });
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
    patterns: settingsCache.patterns
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
  const normalizedText = normalizeText(text).slice(0, 320);
  const settingsSignature = getSettingsSignature();

  if (
    row.dataset[TEXT_CACHE_FLAG] === normalizedText &&
    row.dataset[SETTINGS_CACHE_FLAG] === settingsSignature
  ) {
    return row.dataset[MATCH_FLAG] === "1";
  }

  const matched = text ? shouldHideText(text) : false;
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
  matcherCache = buildMatchers(settingsCache.patterns || []);
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
    matcherCache = buildMatchers(settingsCache.patterns || []);
    scheduleScan();
  });
}

init();
