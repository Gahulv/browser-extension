# Weibo LLM and Cloud Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenAI-compatible name extraction and GitHub raw cloud rules to the Weibo browser extension.

**Architecture:** Shared pure helpers live in `weibo-extension/shared.js` and are consumed by popup, content script, and Node tests. Popup owns settings, LLM calls, GitHub upload, cloud sync, and candidate display. Content script combines local and cached cloud rules for page filtering.

**Tech Stack:** Manifest V3 extension, plain JavaScript, Chrome extension APIs, Node built-in test runner.

---

### Task 1: Shared Helper Tests

**Files:**
- Create: `weibo-extension/shared.js`
- Create: `weibo-extension/shared.test.js`

- [ ] **Step 1: Write failing helper tests**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("./shared.js");

test("parseRulesText accepts exported JSON pattern payloads", () => {
  assert.deepEqual(shared.parseRulesText('{"patterns":["广告"," 热搜 "]}'), ["广告", "热搜"]);
});

test("mergeUniquePatterns deduplicates normalized rules", () => {
  assert.deepEqual(shared.mergeUniquePatterns(["广告"], [" 广 告 ", "明星"]), ["广告", "明星"]);
});

test("shouldHideText matches combined local and remote matchers", () => {
  const matchers = shared.buildMatchers(["广告", "张三"]);
  assert.equal(shared.shouldHideText("张三 出席活动", matchers, true), true);
  assert.equal(shared.shouldHideText("正常热搜", matchers, true), false);
});

test("parseNameCandidatesFromChatResponse extracts JSON names", () => {
  const response = {
    choices: [
      {
        message: {
          content: '{"names":["张三","李四","张三"]}'
        }
      }
    ]
  };

  assert.deepEqual(shared.parseNameCandidatesFromChatResponse(response), ["张三", "李四"]);
});

test("buildGithubRawUrl builds raw.githubusercontent.com URL", () => {
  assert.equal(
    shared.buildGithubRawUrl({
      owner: "me",
      repo: "rules",
      branch: "main",
      path: "weibo/filter.json"
    }),
    "https://raw.githubusercontent.com/me/rules/main/weibo/filter.json"
  );
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test weibo-extension/shared.test.js`

Expected: FAIL because `shared.js` does not exist or does not export the helpers.

- [ ] **Step 3: Implement shared helpers**

Add browser globals plus CommonJS exports for `DEFAULT_SETTINGS`, rule parsing, matching, dedupe, candidate parsing, and GitHub raw URL generation.

- [ ] **Step 4: Run tests and verify they pass**

Run: `node --test weibo-extension/shared.test.js`

Expected: all helper tests pass.

### Task 2: Content Script Integration

**Files:**
- Modify: `weibo-extension/manifest.json`
- Modify: `weibo-extension/content.js`

- [ ] **Step 1: Load `shared.js` before `content.js`**

Add `shared.js` to the content script `js` array before `content.js`.

- [ ] **Step 2: Use shared matchers**

Replace local duplicate matcher helpers with calls to `window.WeiboFilterShared`, and build matchers from `patterns` plus `remotePatterns`.

- [ ] **Step 3: Add popup text collection message**

Add `chrome.runtime.onMessage` handling for `{ type: "GET_WEIBO_PAGE_TEXTS" }`, returning hot row texts and page status.

- [ ] **Step 4: Run syntax check**

Run: `node --check weibo-extension/content.js`

Expected: no syntax errors.

### Task 3: Popup UI and Behavior

**Files:**
- Modify: `weibo-extension/popup.html`
- Modify: `weibo-extension/popup.css`
- Modify: `weibo-extension/popup.js`

- [ ] **Step 1: Load `shared.js` before `popup.js`**

Add a script tag for `shared.js`.

- [ ] **Step 2: Add settings UI**

Add compact sections for LLM settings, identified candidates, cloud raw URL sync, and GitHub upload.

- [ ] **Step 3: Add LLM extraction**

On popup load, collect active tab texts, call the OpenAI-compatible endpoint when configured, parse candidates, and render add buttons.

- [ ] **Step 4: Add cloud rule sync**

Fetch `cloudRulesUrl`, parse rules, store `remotePatterns` and sync metadata, then let content script react via storage change.

- [ ] **Step 5: Add GitHub upload**

Use GitHub Contents API to create or update the configured JSON path and store the generated raw URL.

- [ ] **Step 6: Run syntax checks**

Run:

```bash
node --check weibo-extension/popup.js
node --check weibo-extension/shared.js
```

Expected: no syntax errors.

### Task 4: Manifest Permissions and Documentation

**Files:**
- Modify: `weibo-extension/manifest.json`
- Modify: `weibo-extension/README.md`

- [ ] **Step 1: Add required permissions**

Add `activeTab` and host permissions for configurable LLM calls, GitHub API, and GitHub raw URLs.

- [ ] **Step 2: Document run and configuration**

Update README with OpenAI-compatible settings, GitHub upload requirements, cloud raw URL behavior, and unpacked extension loading steps.

- [ ] **Step 3: Run final verification**

Run:

```bash
node --test weibo-extension/shared.test.js
node --check weibo-extension/content.js
node --check weibo-extension/popup.js
node --check weibo-extension/shared.js
```

Expected: tests pass and syntax checks return no errors.
