---
id: TASK-1
title: 版一覧のページングと非同期削除
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - versions
  - scalability
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
バージョンを無制限に保持する方針のため、版が数千件になると O(N) の経路が Workers の実行時間・レスポンス・subrequest 制約に当たる。

現状の O(N) 経路:
- GET /docs/:slug/share（SharePanel）と GET /api/documents/:slug/versions が全版を返す
- deleteDocument が全版の blob を直列に削除する

PR #10 の codex レビュー（gpt-5.6-sol xhigh）で指摘され、別機能として移送した項目。
「保持無制限」という確定仕様上、例外状態ではなく時間とともに必ず到達する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 版一覧が cursor pagination で取得できる
- [ ] #2 共有ポップオーバーが段階ロードになり、版数によらず一定時間で開く
- [ ] #3 削除が再開可能な batch cleanup になり、途中失敗しても残りを掃除できる
<!-- AC:END -->
