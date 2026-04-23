const DEFAULT_SETTINGS = {
  enabled: true,
  patterns: ["广告"]
};

const elements = {
  enabled: document.getElementById("enabled"),
  patterns: document.getElementById("patterns"),
  addPatterns: document.getElementById("addPatterns"),
  patternSearch: document.getElementById("patternSearch"),
  patternList: document.getElementById("patternList"),
  exportPatterns: document.getElementById("exportPatterns"),
  clearPatterns: document.getElementById("clearPatterns"),
  emptyState: document.getElementById("emptyState"),
  status: document.getElementById("status")
};

let currentSettings = { ...DEFAULT_SETTINGS };

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => resolve(settings));
  });
}

function setSettings(nextSettings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(nextSettings, resolve);
  });
}

function normalizeForCompare(value) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ");
}

function setStatus(message) {
  elements.status.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    elements.status.textContent = "";
  }, 2200);
}

function render(settings) {
  currentSettings = settings;
  elements.enabled.checked = settings.enabled;
  const query = normalizeForCompare(elements.patternSearch.value || "");
  const visiblePatterns = query
    ? settings.patterns.filter((pattern) => normalizeForCompare(pattern).includes(query))
    : settings.patterns;
  elements.patternList.innerHTML = "";

  visiblePatterns.forEach((pattern) => {
    const item = document.createElement("li");
    item.className = "pattern-item";

    const text = document.createElement("span");
    text.textContent = pattern;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "删除";
    removeButton.addEventListener("click", async () => {
      const nextPatterns = settings.patterns.filter((entry) => entry !== pattern);
      await setSettings({ patterns: nextPatterns });
      render({ ...settings, patterns: nextPatterns });
      setStatus("规则已删除");
    });

    item.append(text, removeButton);
    elements.patternList.appendChild(item);
  });

  if (!settings.patterns.length) {
    elements.emptyState.textContent = "暂无规则，添加后在热搜页自动生效。";
    elements.emptyState.style.display = "block";
    return;
  }

  if (!visiblePatterns.length) {
    elements.emptyState.textContent = "未找到匹配规则。";
    elements.emptyState.style.display = "block";
    return;
  }

  elements.emptyState.style.display = "none";
}

async function addPatterns() {
  const rawLines = elements.patterns.value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rawLines.length) {
    setStatus("请输入至少一条文本");
    return;
  }

  const settings = await getSettings();
  const seen = new Set(settings.patterns.map(normalizeForCompare));
  const nextPatterns = [...settings.patterns];

  rawLines.forEach((line) => {
    const key = normalizeForCompare(line);
    if (!seen.has(key)) {
      seen.add(key);
      nextPatterns.push(line);
    }
  });

  await setSettings({ patterns: nextPatterns });
  elements.patterns.value = "";
  render({ ...settings, patterns: nextPatterns });
  setStatus("规则已更新");
}

async function exportPatterns() {
  const settings = await getSettings();
  if (!settings.patterns.length) {
    setStatus("没有可导出的规则");
    return;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    patterns: settings.patterns
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `weibo-filter-rules-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("规则已导出");
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  render(settings);
});

elements.addPatterns.addEventListener("click", addPatterns);

elements.enabled.addEventListener("change", async (event) => {
  await setSettings({ enabled: event.target.checked });
  setStatus(event.target.checked ? "已启用" : "已停用");
});

elements.patternSearch.addEventListener("input", () => {
  render(currentSettings);
});

elements.exportPatterns.addEventListener("click", exportPatterns);

elements.clearPatterns.addEventListener("click", async () => {
  await setSettings({ patterns: [] });
  const settings = await getSettings();
  render(settings);
  setStatus("规则已清空");
});
