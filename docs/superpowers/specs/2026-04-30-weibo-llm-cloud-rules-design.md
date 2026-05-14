# Weibo LLM and Cloud Rules Design

## Goal

Extend `weibo-extension` so the popup can identify names from the current Weibo page through an OpenAI-compatible API, let the user add identified names to local rules, and match both local and GitHub-hosted cloud rules.

## Scope

- Add OpenAI-compatible settings: base URL, API key, and model.
- When the popup opens on a Weibo page, collect hot-list text from the content script and run name extraction if LLM settings are complete.
- Show extracted candidate names in the popup with an action to add each candidate to the local rules.
- Add GitHub upload settings for the current local rules JSON using the GitHub Contents API.
- Add a cloud rules raw URL setting. Fetch, parse, cache, and match those rules together with local rules.

## Architecture

- `shared.js` owns pure helpers for rule parsing, matching, deduplication, candidate parsing, and GitHub raw URL creation. It is loaded before `popup.js` and `content.js`, and also exported for Node tests.
- `content.js` keeps page scanning and hiding behavior. It reads `patterns` plus `remotePatterns`, builds combined matchers, and exposes a message handler for popup text collection.
- `popup.js` owns settings UI, LLM requests, GitHub upload, cloud rule sync, and candidate rendering.

## Data Flow

1. Popup loads settings from `chrome.storage.local`.
2. Popup asks the active tab content script for Weibo page texts.
3. Popup posts those texts to `${baseUrl}/chat/completions` with the configured API key and model.
4. Popup parses the response as a list of names and renders candidates not already present in local rules.
5. Clicking a candidate appends it to `patterns`.
6. Cloud rule sync fetches raw JSON/text from `cloudRulesUrl`, parses it to `remotePatterns`, and stores metadata.
7. Content script combines `patterns` and `remotePatterns` for matching.

## Error Handling

- Missing LLM settings disables automatic identification and shows a concise hint.
- Failed LLM, GitHub upload, or cloud fetch operations show status text without breaking local rule management.
- Invalid cloud rule payloads are rejected without clearing the last cached cloud rules.
- GitHub upload requires token, owner, repo, path, and branch; upload first reads the existing file SHA, then creates or updates it.

## Testing

- Add Node tests for pure helpers in `shared.js`.
- Run syntax checks for changed extension scripts.
- Manual run path remains loading `weibo-extension` as an unpacked browser extension.
