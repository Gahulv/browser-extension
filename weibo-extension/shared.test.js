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

