---
id: TASK-5
title: グループ招待
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - auth
dependencies: []
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在は個人グループのみ。他ユーザーを招待してドキュメントを共有できるようにする。

users / groups / user_groups のテーブルは既にあり、findOrCreateUser が個人グループを自動作成している。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 既存グループに他ユーザーを招待できる
- [ ] #2 招待されたユーザーがそのグループのドキュメントを閲覧・更新できる
<!-- AC:END -->
