const shared = window.WeiboFilterShared;
const DEFAULT_SETTINGS = shared.DEFAULT_SETTINGS;

const elements = {
  enabled: document.getElementById("enabled"),
  patterns: document.getElementById("patterns"),
  addPatterns: document.getElementById("addPatterns"),
  patternSearch: document.getElementById("patternSearch"),
  patternList: document.getElementById("patternList"),
  importPatterns: document.getElementById("importPatterns"),
  importFile: document.getElementById("importFile"),
  exportPatterns: document.getElementById("exportPatterns"),
  clearPatterns: document.getElementById("clearPatterns"),
  emptyState: document.getElementById("emptyState"),
  cloudRulesUrl: document.getElementById("cloudRulesUrl"),
  syncCloudRules: document.getElementById("syncCloudRules"),
  cloudRulesMeta: document.getElementById("cloudRulesMeta"),
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

function setStatus(message) {
  elements.status.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    elements.status.textContent = "";
  }, 2600);
}

function render(settings) {
  currentSettings = { ...DEFAULT_SETTINGS, ...settings };
  renderSettingsForm(currentSettings);
  renderPatternList(currentSettings);
  renderCloudMeta(currentSettings);
}

function renderSettingsForm(settings) {
  elements.enabled.checked = settings.enabled;
  elements.cloudRulesUrl.value = settings.cloudRulesUrl || "";
}

function getRenderableRules(settings) {
  const rules = [];
  const seen = new Set();

  (settings.patterns || []).forEach((pattern) => {
    const key = shared.normalizeRuleKey(pattern);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    rules.push({ pattern, source: "local" });
  });

  (settings.remotePatterns || []).forEach((pattern) => {
    const key = shared.normalizeRuleKey(pattern);
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    rules.push({ pattern, source: "remote" });
  });

  return rules;
}

function renderPatternList(settings) {
  const query = shared.normalizeForCompare(elements.patternSearch.value || "");
  const rules = getRenderableRules(settings);
  const visibleRules = query
    ? rules.filter(({ pattern }) => shared.normalizeForCompare(pattern).includes(query))
    : rules;

  elements.patternList.innerHTML = "";

  visibleRules.forEach(({ pattern, source }) => {
    const item = document.createElement("li");
    item.className = source === "remote" ? "pattern-item is-remote" : "pattern-item";

    const text = document.createElement("span");
    text.textContent = pattern;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = source === "remote" ? "云端" : "删除";
    removeButton.disabled = source === "remote";
    removeButton.addEventListener("click", async () => {
      if (source !== "local") {
        return;
      }

      const nextPatterns = settings.patterns.filter((entry) => entry !== pattern);
      await setSettings({ patterns: nextPatterns });
      render({ ...settings, patterns: nextPatterns });
      setStatus("规则已删除");
    });

    item.append(text, removeButton);
    elements.patternList.appendChild(item);
  });

  if (!rules.length) {
    elements.emptyState.textContent = "暂无规则，添加后在热搜页自动生效。";
    elements.emptyState.style.display = "block";
    return;
  }

  if (!visibleRules.length) {
    elements.emptyState.textContent = "未找到匹配规则。";
    elements.emptyState.style.display = "block";
    return;
  }

  elements.emptyState.style.display = "none";
}

function renderCloudMeta(settings) {
  const count = (settings.remotePatterns || []).length;
  const synced = settings.cloudRulesLastSynced
    ? `，上次同步：${new Date(settings.cloudRulesLastSynced).toLocaleString()}`
    : "";
  elements.cloudRulesMeta.textContent = `云端规则 ${count} 条${synced}。本地规则和云端规则会同时匹配。`;
}

function parseImportedPatterns(text) {
  return shared.parseRulesText(text);
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
  const nextPatterns = shared.mergeUniquePatterns(settings.patterns || [], rawLines);

  await setSettings({ patterns: nextPatterns });
  elements.patterns.value = "";
  render({ ...settings, patterns: nextPatterns });
  setStatus(`规则已更新：新增 ${nextPatterns.length - (settings.patterns || []).length} 条`);
}

async function exportPatterns() {
  const settings = await getSettings();
  if (!settings.patterns.length) {
    setStatus("没有可导出的本地规则");
    return;
  }

  downloadRules(settings.patterns);
  setStatus("规则已导出");
}

function downloadRules(patterns) {
  const payload = {
    exportedAt: new Date().toISOString(),
    patterns
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
}

function openImportPicker() {
  elements.importFile.value = "";
  elements.importFile.click();
}

async function importPatternsFromFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    const importedPatterns = parseImportedPatterns(content);
    if (!importedPatterns.length) {
      throw new Error("导入文件里没有可用规则");
    }

    const settings = await getSettings();
    const nextPatterns = shared.mergeUniquePatterns(settings.patterns || [], importedPatterns);
    const addedCount = nextPatterns.length - (settings.patterns || []).length;

    await setSettings({ patterns: nextPatterns });
    render({ ...settings, patterns: nextPatterns });
    setStatus(`导入完成：${addedCount} 条新增`);
  } catch (error) {
    setStatus(error.message || "导入失败");
  } finally {
    elements.importFile.value = "";
  }
}

async function syncCloudRules() {
  const cloudRulesUrl = elements.cloudRulesUrl.value.trim();
  if (!cloudRulesUrl) {
    setStatus("请输入 GitHub raw URL");
    return;
  }

  try {
    setStatus("正在同步云端规则...");
    const response = await fetch(cloudRulesUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`云端规则请求失败：${response.status}`);
    }

    const remotePatterns = shared.parseRulesText(await response.text());
    if (!remotePatterns.length) {
      throw new Error("云端规则为空或格式不正确");
    }

    const nextSettings = {
      cloudRulesUrl,
      remotePatterns,
      cloudRulesLastSynced: new Date().toISOString()
    };
    await setSettings(nextSettings);
    render({ ...currentSettings, ...nextSettings });
    setStatus(`云端规则已同步：${remotePatterns.length} 条`);
  } catch (error) {
    setStatus(error.message || "云端规则同步失败");
  }
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

elements.importPatterns.addEventListener("click", openImportPicker);
elements.importFile.addEventListener("change", importPatternsFromFile);
elements.exportPatterns.addEventListener("click", exportPatterns);
elements.syncCloudRules.addEventListener("click", syncCloudRules);

elements.clearPatterns.addEventListener("click", async () => {
  await setSettings({ patterns: [] });
  const settings = await getSettings();
  render(settings);
  setStatus("本地规则已清空");
});
