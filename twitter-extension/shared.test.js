const test = require("node:test");
const assert = require("node:assert/strict");
const shared = require("./shared.js");

function makeMatchContext({ text, authorName = "普通用户", handle = "normal_user" }) {
  return {
    text,
    authorName,
    handle,
    matchers: shared.buildMatchers(["广告", "/私信.{0,4}兼职/i"]),
    settings: {
      enabled: true,
      smartSpamFilterEnabled: true
    }
  };
}

test("hides local appointment marketer with emoji-only reply", () => {
  assert.equal(
    shared.shouldHideTweet(
      makeMatchContext({
        authorName: "陆茉💎同城约爱💎无任何套路",
        handle: "Joshua396904",
        text: "😵"
      })
    ),
    true
  );
});

test("hides fixed-hookup marketer with meaningless multiline reply", () => {
  assert.equal(
    shared.shouldHideTweet(
      makeMatchContext({
        authorName: "寻固炮💧",
        handle: "BarbierAmb63918",
        text: "G🏸\n24😵‍\nh8g"
      })
    ),
    true
  );
});

test("hides offline marketer with symbol-only reply", () => {
  assert.equal(
    shared.shouldHideTweet(
      makeMatchContext({
        authorName: "樱桃丸子🍑无🚪线下🍑",
        handle: "KariVik75462",
        text: "】"
      })
    ),
    true
  );
});

test("does not hide normal users for short low-content replies", () => {
  ["😵", "6", "哈哈", "？", "G🏸"].forEach((text) => {
    assert.equal(
      shared.shouldHideTweet(
        makeMatchContext({
          authorName: "正常用户",
          handle: "normal_user",
          text
        })
      ),
      false,
      text
    );
  });
});

test("does not hide random-looking handles without marketer name signals", () => {
  assert.equal(
    shared.shouldHideTweet(
      makeMatchContext({
        authorName: "Kari Vik",
        handle: "KariVik75462",
        text: "😵"
      })
    ),
    false
  );
});

test("still hides text and regex rule matches", () => {
  assert.equal(shared.shouldHideTweet(makeMatchContext({ text: "这里有广告" })), true);
  assert.equal(shared.shouldHideTweet(makeMatchContext({ text: "私信我做兼职" })), true);
});

test("disabling smart spam keeps custom rules only", () => {
  assert.equal(
    shared.shouldHideTweet({
      ...makeMatchContext({
        authorName: "陆茉💎同城约爱💎无任何套路",
        handle: "Joshua396904",
        text: "😵"
      }),
      settings: {
        enabled: true,
        smartSpamFilterEnabled: false
      }
    }),
    false
  );
});
