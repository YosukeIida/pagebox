---
id: TASK-2
title: 部分失敗の reconciler
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - versions
  - reliability
dependencies: []
priority: medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
R2 put 後に DB 書き込みが失敗した場合、add-document-version.ts は自分が書いた blob を補償削除するが、プロセス落ちや Worker の実行打ち切りには対応できず孤児 blob が残る。

pending / ready / deleting の状態を持たせ、冪等な cleanup を回すと完全になる。
PR #10 の codex レビューで指摘され、状態機械の導入は本 PR のスコープ外として移送した。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 孤児 blob を検出して回収できる
- [ ] #2 cleanup が冪等で、途中で止めても再実行できる
<!-- AC:END -->
