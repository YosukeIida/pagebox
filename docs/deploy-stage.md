# stage 環境

PR のコードを本番に入れる前に検証するための環境。**本番と同じ2ホスト構成**を再現しているため、
閲覧経路・OGP・XSS 隔離まで本番同等に確認できる。

| | 本番 | stage |
|---|---|---|
| Worker | `pagebox` | `pagebox-stage`（`[env.stage]` から自動命名） |
| アプリ | `pagebox.iodine2.net` | `stage.pagebox.iodine2.net` |
| 閲覧 | `view.pagebox.iodine2.net` | `view.stage.pagebox.iodine2.net` |
| D1 | `pagebox` | `pagebox-stage` |
| R2 | `pagebox-blobs` | `pagebox-blobs-stage` |
| KV | `OG_CACHE_KV`（本番 ID） | `OG_CACHE_KV`（stage ID） |
| Analytics | `pagebox_events` | `pagebox_events_stage` |
| Rate limit | namespace `10001` | namespace `10002` |
| `/admin` | 全パネル | **UI のみ**（`CLOUDFLARE_API_TOKEN` を置かないため外部 API 由来のパネルは空） |

---

## 設計方針

### stage は1本を取り合う（`stage` ラベルが占有権）

カスタムドメインの背後に立てられる version は**常に1つ**なので、全 PR が自動で deploy すると
最後に push した PR が黙って上書きしてしまう。そこで:

- **`stage` ラベルを付けた PR だけ**が deploy 対象（`.github/workflows/stage.yml`）
- ラベルが付いている PR は、以降の push で**自動的に** stage が更新される
- **他の open PR が既に `stage` ラベルを持っていたら CI がガードで落ちる**（「#NN が使用中」と表示）
- 確認が終わったらラベルを外して次の PR に譲る

### データは PR 間で共有する（PR ごとに DB は作らない）

D1 / R2 / KV は stage に1セットだけ。競合しうるのは**破壊的なマイグレーション**だけなので、
インフラを増やすのではなく次の3つの規律で抑える。

1. **マイグレーションは後方互換に保つ**（`ADD COLUMN` / 新テーブル / backfill）。そうすれば
   適用後も他 PR の古いコードが動く
2. **列の削除・リネームを含む PR は stage を単独で確保する**
3. **壊れたら `make cf-stage-reset` で作り直す**。1コマンドで戻せるので競合が怖くなくなる

マイグレーションの適用は**CI では流さない**。共有 DB を触る唯一の操作なので、
`make cf-stage-migrate` の手動実行に限定して人の判断下に置く。

---

## 初回セットアップ

`wrangler.toml` の `[env.stage]` にある `TODO_*` を埋めるまで deploy は失敗する。順番に実行する。

### 1. リソースを作る

```bash
make cf-stage-d1-create    # 出力の database_id を控える
make cf-stage-kv-create    # 出力の id を控える
make cf-stage-r2-create
```

`deploy/cloudflare/wrangler.toml` の以下を書き換える。

- `[[env.stage.d1_databases]].database_id` ← `TODO_STAGE_D1_DATABASE_ID`
- `[[env.stage.kv_namespaces]].id` ← `TODO_STAGE_KV_NAMESPACE_ID`

### 2. Cloudflare Access アプリを2つ作る（ダッシュボードで手動）

API では既存ルートドメインアプリがあるとサブパス／サブドメインアプリを作れないことがあるため
（`HANDOVER.md` の記録参照）、**ダッシュボードで作成する**。

| アプリ | ホスト名 | ポリシー |
|---|---|---|
| `pagebox-stage` | `stage.pagebox.iodine2.net` | **Allow**（自分のメールアドレス） |
| `pagebox-stage-viewer` | `view.stage.pagebox.iodine2.net` | **Bypass**（共有 URL なので認証なしで開ける） |

`pagebox-stage` の **Application Audience (AUD) Tag** を
`[env.stage.vars].ACCESS_AUD`（`TODO_STAGE_ACCESS_AUD`）に書き込む。

> `view.*` を Bypass にしないと、共有した相手が閲覧できない。本番の `pagebox-viewer` と同じ考え方。

### 3. secret を入れる

```bash
make cf-stage-secret       # ADMIN_EMAILS のみ
```

**`CLOUDFLARE_API_TOKEN` は stage に入れない。** 本番スコープのトークンを stage に置かないため。
その結果 `/admin` の Analytics・ログイン履歴・システム状態のパネルは空欄になる（D1 由来の統計は出る）。

### 4. deploy

```bash
make stage-deploy-dry      # ⚠️ 必ず先に実行。routes と bindings を表示して確認する
make stage-deploy          # custom_domain が DNS レコードと証明書を自動発行する
make cf-stage-migrate      # D1 にマイグレーションを適用
```

`stage-deploy-dry` が出すもの:

- **`[env.stage]` の routes**（設定ファイルをそのまま表示）— 本番ドメインが混ざっていないか。
  wrangler の `--dry-run` は routes を出力しないため、設定ファイルを直接見て確認する
- **bindings 一覧**（`wrangler --dry-run`）— `pagebox-stage` / `pagebox-blobs-stage` /
  `pagebox_events_stage` を指しているか。ここに本番のリソース名が出たら止める

### 5. 本番が無傷であることを確認

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://pagebox.iodine2.net/
npx wrangler deployments list --config deploy/cloudflare/wrangler.toml   # live version が変わっていないこと
```

### 6. GitHub の設定

- リポジトリに `stage` ラベルを作成
- Secrets に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を登録
  （トークンには stage ドメインに対する Zone: Workers Routes Edit も必要）

---

## ⚠️ routes は環境に継承される

wrangler の `routes` は **inheritable** で、`[env.stage]` に書かないと
`wrangler deploy --env stage` が**本番のカスタムドメインを stage worker に奪わせる**。

`wrangler.toml` の `[env.stage]` では routes を必ず明示している。設定を触るときはここを崩さないこと。
`stage-deploy` の前に `stage-deploy-dry` を通すのはこの事故を防ぐため（CI でも routes 表示と dry-run を先に走らせている）。

同じ理由で、本番側にも `workers_dev = false` / `preview_urls = false` を明示して現状を固定してある。

---

## PR での使い方

1. PR に `stage` ラベルを付ける → CI が deploy し、PR にコメントが付く
2. 以降の push は自動で stage に反映される
3. マイグレーションを含むなら `make cf-stage-migrate` を手動実行
4. `https://stage.pagebox.iodine2.net` で確認（Access ログインが入る）
5. 終わったら **`stage` ラベルを外す**（次の PR が使えるようになる）

## 困ったとき

| 症状 | 対処 |
|---|---|
| CI が「stage は #NN が使用中」で落ちる | その PR の `stage` ラベルを外してもらう |
| stage のデータがおかしい | `make cf-stage-reset`（D1 を初期化して migrations を再適用） |
| `TODO_STAGE_*` のまま deploy して失敗する | 上の初回セットアップ 1〜2 を実施する |
| `/admin` のパネルが空 | 仕様（stage に API トークンを置いていない） |

`cf-stage-reset` は **R2 の孤児オブジェクトを残す**（wrangler に一括削除が無い）。
DB から参照されないので無害だが、完全に消したい場合は R2 バケットを作り直す。

---

## 将来の拡張

フロントだけで完結する変更なら、PR ごとの並列プレビューも足せる。
`[env.stage]` に `workers_dev = true` / `preview_urls = true` を設定し、
`wrangler versions upload --env stage --preview-alias pr-<番号>` を使うと
`pr-42-pagebox-stage.<subdomain>.workers.dev` が PR ごとに発行され、live を奪わずに並列で確認できる。
ただし**ホスト名が1つしかないため view サブドメイン分離は再現できない**ので、
閲覧経路や OGP を見たいときは従来どおりカスタムドメインの stage を使う。
