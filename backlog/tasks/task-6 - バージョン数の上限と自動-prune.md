---
id: TASK-6
title: バージョン数の上限と自動 prune
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - versions
  - storage
dependencies: []
priority: low
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在バージョンは無制限に保持している。R2 使用量が問題になったら「上限 N 版を超えたら最古を prune」を入れる。

admin ダッシュボードの総バージョン数・総ストレージ使用量（document_versions 基準）で監視できる。着手の判断はその数値を見てから。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 上限を超えた版が blob ごと prune される
- [ ] #2 prune の有無と上限が設定で切り替えられる
<!-- AC:END -->
