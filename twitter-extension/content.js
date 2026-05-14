const shared = window.TwitterFilterShared;
const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;

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

function isConversationPage() {
  return /\/status\/\d+/.test(location.pathname);
}

function getCombinedPatterns() {
  return shared.mergeUniquePatterns(settingsCache.patterns || [], settingsCache.remotePatterns || []);
}

function getSettingsSignature() {
  return JSON.stringify({
    enabled: settingsCache.enabled,
    smartSpamFilterEnabled: settingsCache.smartSpamFilterEnabled,
    patterns: getCombinedPatterns()
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

function getAuthorInfo(article) {
  const userNameNode = article.querySelector('[data-testid="User-Name"]');
  const userNameText = (userNameNode?.textContent || "").trim();
  const handleMatch = userNameText.match(/@([A-Za-z0-9_]+)/);
  const handle = handleMatch ? handleMatch[1] : getHandleFromProfileLink(article);
  const authorName = userNameText
    ? userNameText.replace(/@([A-Za-z0-9_]+).*/, "").trim()
    : "";

  return {
    authorName,
    handle
  };
}

function getHandleFromProfileLink(article) {
  const links = Array.from(article.querySelectorAll('a[href^="/"]'));
  const profileLink = links.find((link) => {
    const href = link.getAttribute("href") || "";
    return /^\/[A-Za-z0-9_]+$/.test(href);
  });

  return profileLink ? profileLink.getAttribute("href").slice(1) : "";
}

function getTweetInfo(article) {
  return {
    text: getTweetText(article),
    ...getAuthorInfo(article)
  };
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
  const tweetInfo = getTweetInfo(article);
  const normalizedText = shared
    .normalizeText([tweetInfo.text, tweetInfo.authorName, tweetInfo.handle].join(" "))
    .slice(0, 360);
  const settingsSignature = getSettingsSignature();

  if (
    article.dataset[TEXT_CACHE_FLAG] === normalizedText &&
    article.dataset[SETTINGS_CACHE_FLAG] === settingsSignature
  ) {
    return article.dataset[MATCH_FLAG] === "1";
  }

  const matched = shared.shouldHideTweet({
    ...tweetInfo,
    matchers: matcherCache,
    settings: settingsCache
  });
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
  matcherCache = shared.buildMatchers(getCombinedPatterns());
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
    matcherCache = shared.buildMatchers(getCombinedPatterns());
    scheduleScan();
  });
}

init();
