(function initShared(root) {
  const DEFAULT_SETTINGS = {
    enabled: true,
    patterns: ["广告"],
    remotePatterns: [],
    cloudRulesUrl: "",
    cloudRulesLastSynced: ""
  };

  function normalizeText(value) {
    return (value || "")
      .toLocaleLowerCase()
      .normalize("NFKC")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function normalizeForCompare(value) {
    return (value || "").trim().toLocaleLowerCase().normalize("NFKC").replace(/\s+/g, " ");
  }

  function normalizeRuleKey(value) {
    return normalizeText(value);
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
      // Fall back to line-by-line plain text parsing.
    }

    return cleanPatternList(raw.split(/\r?\n/g));
  }

  function cleanPatternList(patterns) {
    return patterns.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  function mergeUniquePatterns(basePatterns, incomingPatterns) {
    const seen = new Set();
    const merged = [];

    [...cleanPatternList(basePatterns || []), ...cleanPatternList(incomingPatterns || [])].forEach(
      (pattern) => {
        const key = normalizeRuleKey(pattern);
        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);
        merged.push(pattern);
      }
    );

    return merged;
  }

  function buildMatchers(patterns) {
    return cleanPatternList(patterns || [])
      .map((pattern) => {
        const normalized = normalizeText(pattern);
        if (!normalized) {
          return null;
        }

        return {
          rawLower: pattern.toLocaleLowerCase().normalize("NFKC"),
          normalized
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
      if (matcher.rawLower && rawComparable.includes(matcher.rawLower)) {
        return true;
      }

      return Boolean(normalizedText) && normalizedText.includes(matcher.normalized);
    });
  }

  const api = {
    DEFAULT_SETTINGS,
    normalizeText,
    normalizeForCompare,
    normalizeRuleKey,
    parseRulesText,
    mergeUniquePatterns,
    buildMatchers,
    shouldHideText
  };

  root.WeiboFilterShared = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
