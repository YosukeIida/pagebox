---
id: TASK-3
title: 特定版へのピン留め
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - versions
dependencies: []
priority: medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Claude Code artifact の「Always share latest version」トグル OFF 相当。共有 URL が指す版を最新以外に固定する。

現状は「共有 URL は常に最新版」に固定している。
実装は documents.pinned_version（nullable）1列と配信側の 1 分岐で足りる見込み。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 共有 URL が指す版を UI から固定・解除できる
- [ ] #2 ピン留め中は OGP も固定した版を指す
<!-- AC:END -->
