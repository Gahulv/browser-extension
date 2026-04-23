const DEFAULT_SETTINGS = {
  enabled: true,
  patterns: ["广告"]
};

const HIDDEN_FLAG = "commentFilterHidden";
const PREV_DISPLAY_FLAG = "commentFilterPrevDisplay";
const MATCH_FLAG = "commentFilterMatched";
const TEXT_CACHE_FLAG = "commentFilterTextCache";
const SETTINGS_CACHE_FLAG = "commentFilterSettingsCache";

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
    .replace(/@\w+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function parseRegexPattern(value) {
  const match = value.match(/^\/(.+)\/([a-z]*)$/i);
  if (!match) {
    return null;
  }

  return {
    source: match[1],
    flags: match[2]
  };
}

function buildMatchers(patterns) {
  return patterns
    .map((pattern) => {
      const regexPattern = parseRegexPattern(pattern);
      if (regexPattern) {
        try {
          return {
            type: "regex",
            raw: pattern,
            regex: new RegExp(regexPattern.source, regexPattern.flags)
          };
        } catch (error) {
          return null;
        }
      }

      const normalizedPattern = normalizeText(pattern);
      if (!normalizedPattern) {
        return null;
      }

      return {
        type: "text",
        raw: pattern,
        rawLower: pattern.toLocaleLowerCase().normalize("NFKC"),
        normalized: normalizedPattern
      };
    })
    .filter(Boolean);
}

function shouldHideText(rawText) {
  if (!settingsCache.enabled || !matcherCache.length) {
    return false;
  }

  const raw = rawText || "";
  const rawComparable = raw.toLocaleLowerCase().normalize("NFKC");
  const normalizedText = normalizeText(raw).slice(0, 320);
  if (!raw.trim()) {
    return false;
  }

  return matcherCache.some((matcher) => {
    if (matcher.type === "regex") {
      matcher.regex.lastIndex = 0;
      return matcher.regex.test(raw);
    }

    if (matcher.rawLower && rawComparable.includes(matcher.rawLower)) {
      return true;
    }

    return Boolean(normalizedText) && normalizedText.includes(matcher.normalized);
  });
}

function isConversationPage() {
  return /\/status\/\d+/.test(location.pathname);
}

function getSettingsSignature() {
  return JSON.stringify({
    enabled: settingsCache.enabled,
    patterns: settingsCache.patterns
  });
}

function getTweetText(article) {
  const textNodes = article.querySelectorAll('[data-testid="tweetText"]');
  const combined = Array.from(textNodes)
    .map((node) => node.textContent || "")
    .join(" ")
    .trim();

  return combined || article.textContent || "";
}

function getTweetArticles() {
  return Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
}

function getPrimaryTweet(articles) {
  return articles.find((entry) => entry.offsetParent !== null) || null;
}

function setHidden(article, hidden) {
  if (hidden) {
    if (article.dataset[HIDDEN_FLAG] === "1") {
      return;
    }

    article.dataset[PREV_DISPLAY_FLAG] = article.style.display || "";
    article.style.display = "none";
    article.dataset[HIDDEN_FLAG] = "1";
    return;
  }

  if (article.dataset[HIDDEN_FLAG] !== "1") {
    return;
  }

  article.style.display = article.dataset[PREV_DISPLAY_FLAG] || "";
  delete article.dataset[PREV_DISPLAY_FLAG];
  delete article.dataset[HIDDEN_FLAG];
}

function shouldHideArticle(article) {
  const text = getTweetText(article);
  const normalizedText = normalizeText(text).slice(0, 320);
  const settingsSignature = getSettingsSignature();

  if (
    article.dataset[TEXT_CACHE_FLAG] === normalizedText &&
    article.dataset[SETTINGS_CACHE_FLAG] === settingsSignature
  ) {
    return article.dataset[MATCH_FLAG] === "1";
  }

  const matched = text ? shouldHideText(text) : false;
  article.dataset[TEXT_CACHE_FLAG] = normalizedText;
  article.dataset[SETTINGS_CACHE_FLAG] = settingsSignature;
  article.dataset[MATCH_FLAG] = matched ? "1" : "0";
  return matched;
}

function scanTweets() {
  const tweets = getTweetArticles();

  if (!isConversationPage()) {
    tweets.forEach((article) => setHidden(article, false));
    return;
  }

  const primaryTweet = getPrimaryTweet(tweets);

  tweets.forEach((article) => {
    if (article === primaryTweet) {
      setHidden(article, false);
      return;
    }

    setHidden(article, shouldHideArticle(article));
  });
}

function scheduleScan() {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scanTweets, 120);
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
  scanTweets();

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
