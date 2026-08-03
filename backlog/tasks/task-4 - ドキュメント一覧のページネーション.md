---
id: TASK-4
title: ドキュメント一覧のページネーション
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - performance
dependencies: []
priority: medium
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ドキュメントが増えたときの一覧パフォーマンス対策。GET /api/documents と / の SSR が全件を返している。

「版一覧のページングと非同期削除」とは対象が別（こちらは documents、あちらは document_versions）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 一覧が件数によらず一定時間で描画される
<!-- AC:END -->
