(function initShared(root) {
  const DEFAULT_SETTINGS = {
    enabled: true,
    smartSpamFilterEnabled: true,
    patterns: ["广告"],
    remotePatterns: [],
    cloudRulesUrl: "https://raw.githubusercontent.com/Gahulv/browser-extension/refs/heads/main/twitter-extension/twitter-filter-rules.json",
    cloudRulesLastSynced: ""
  };

  const STRONG_AUTHOR_PATTERNS = [
    /同城.{0,4}(约|爱)/i,
    /约.{0,2}(爱|炮|啪|睡)/i,
    /寻.{0,2}(固炮|炮|伴|主)/i,
    /固炮/i,
    /线下.{0,4}(约|爱|炮|啪|见)/i,
    /(无门|无套路|无任何套路|无🚪)/i,
    /(可约|求约|找主人|私约)/i
  ];

  function normalizeText(value) {
    return (value || "")
      .toLocaleLowerCase()
      .normalize("NFKC")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/@\w+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function normalizeForCompare(value) {
    return (value || "").trim().toLocaleLowerCase().normalize("NFKC").replace(/\s+/g, " ");
  }

  function parseRegexPattern(value) {
    const match = (value || "").match(/^\/(.+)\/([a-z]*)$/i);
    if (!match) {
      return null;
    }

    return {
      source: match[1],
      flags: match[2]
    };
  }

  function buildMatchers(patterns) {
    return (patterns || [])
      .map((pattern) => {
        if (typeof pattern !== "string") {
          return null;
        }

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

  function shouldHideText(rawText, matchers, enabled) {
    if (!enabled || !matchers.length) {
      return false;
    }

    const raw = rawText || "";
    if (!raw.trim()) {
      return false;
    }

    const rawComparable = raw.toLocaleLowerCase().normalize("NFKC");
    const normalizedText = normalizeText(raw).slice(0, 320);

    return matchers.some((matcher) => {
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

  function hasStrongAuthorSpamSignal(authorName) {
    const raw = (authorName || "").trim().normalize("NFKC");
    const normalized = normalizeText(raw);
    if (!raw && !normalized) {
      return false;
    }

    return STRONG_AUTHOR_PATTERNS.some((pattern) => pattern.test(raw) || pattern.test(normalized));
  }

  function hasRandomMarketingHandle(handle) {
    const clean = (handle || "").replace(/^@/, "").trim();
    if (!clean) {
      return false;
    }

    return /^[a-z][a-z]+[a-z]?\d{4,}$/i.test(clean) && clean.length >= 8;
  }

  function isShortJunkReply(text) {
    const raw = (text || "").trim().normalize("NFKC");
    if (!raw) {
      return false;
    }

    const compact = raw.replace(/\s+/g, "");
    const normalized = normalizeText(raw);
    const lines = raw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);

    if (lines.length >= 2 && lines.every((line) => line.replace(/\s+/g, "").length <= 6)) {
      return true;
    }

    if (!/[\p{L}\p{N}]/u.test(compact)) {
      return compact.length <= 8;
    }

    if (/^[a-z0-9]{1,5}$/i.test(normalized) && !/[\u4e00-\u9fff]/u.test(normalized)) {
      return true;
    }

    const hasSymbols = /[^\p{L}\p{N}\s]/u.test(raw);
    if (hasSymbols && normalized.length <= 4 && compact.length <= 8) {
      return true;
    }

    return /^[哈啊呃嗯哦噢呀哇]{1,4}$/u.test(normalized);
  }

  function shouldHideTweet({ text, authorName, handle, matchers, settings }) {
    const effectiveSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    if (!effectiveSettings.enabled) {
      return false;
    }

    if (shouldHideText(text, matchers || [], true)) {
      return true;
    }

    if (!effectiveSettings.smartSpamFilterEnabled) {
      return false;
    }

    const strongAuthorSignal = hasStrongAuthorSpamSignal(authorName);
    if (!strongAuthorSignal) {
      return false;
    }

    return isShortJunkReply(text) || hasRandomMarketingHandle(handle);
  }

  function cleanPatternList(patterns) {
    return patterns.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  function parseRulesText(text) {
    const raw = (text || "").trim();
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return cleanPatternList(parsed);
      }

      if (parsed && Array.isArray(parsed.patterns)) {
        return cleanPatternList(parsed.patterns);
      }
    } catch (error) {
      // Fall back to line-by-line.
    }

    return cleanPatternList(raw.split(/\r?\n/g));
  }

  function mergeUniquePatterns(basePatterns, incomingPatterns) {
    const seen = new Set();
    const merged = [];

    [...cleanPatternList(basePatterns || []), ...cleanPatternList(incomingPatterns || [])].forEach(
      (pattern) => {
        if (!pattern || seen.has(pattern)) {
          return;
        }

        seen.add(pattern);
        merged.push(pattern);
      }
    );

    return merged;
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeText,
    normalizeForCompare,
    parseRegexPattern,
    buildMatchers,
    shouldHideText,
    hasStrongAuthorSpamSignal,
    hasRandomMarketingHandle,
    isShortJunkReply,
    shouldHideTweet,
    parseRulesText,
    mergeUniquePatterns
  };

  root.TwitterFilterShared = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
