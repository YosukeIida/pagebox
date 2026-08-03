---
id: TASK-7
title: S3 ストレージアダプタ
status: To Do
assignee: []
created_date: '2026-08-01 12:55'
labels:
  - adapters
dependencies: []
priority: low
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/storage/s3.ts は throw のみの枠。Cloudflare 以外へ移す場合に必要になる。

StoragePort を実装し container.ts の STORAGE_DRIVER で切り替えられるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 STORAGE_DRIVER=s3 で動作する
<!-- AC:END -->
