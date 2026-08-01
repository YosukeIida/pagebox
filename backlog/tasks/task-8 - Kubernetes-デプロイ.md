---
id: TASK-8
title: Kubernetes デプロイ
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - infra
dependencies: []
priority: low
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
deploy/k8s/ は未実装。オンプレ移行時の選択肢として残している。

Analytics / Rate limit / Access は Cloudflare 固有なので、ports の実装を差し替える必要がある（docs/admin-dashboard.md の「K8s 移行時の互換性」参照）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 k8s マニフェストでアプリが起動する
<!-- AC:END -->
