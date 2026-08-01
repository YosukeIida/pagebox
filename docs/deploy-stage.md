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
- **他の open PR が既に `stage` ラベルを持っていたら CI がガードで落ちる**（「#NN が使用中」と表示）。
  占有確認の API 取得が失敗した場合も落ちる（`set -euo pipefail`。障害を「空き」と解釈しない）
- 確認が終わったらラベルを外して次の PR に譲る

**`workflow_dispatch`（手動実行）は意図的に用意していない。** 手動実行は job 条件と占有ガードを
迂回して任意ブランチを stage に流せてしまうため。ローカルからの deploy が必要なら
`make stage-deploy` を使う（同じ設定ガードを通る）。CI の再実行は GitHub の re-run
（元の `pull_request` イベントで走るのでガードが効く）で行う。

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

### 2. Cloudflare Access アプリを作る

```bash
make cf-stage-access-setup   # ADMIN_EMAILS に限定した Allow ポリシーで作成（冪等）
```

作られるのは **`stage.pagebox.iodine2.net` の1つだけ**。

> **閲覧用の `view.stage.pagebox.iodine2.net` には意図的にアプリを作らない。**
> Access アプリが無いホストは保護対象外＝公開になり、それが期待動作（共有 URL は
> 認証なしで開けなければならない）。本番も `view.pagebox.iodine2.net` にアプリを置いていない。
>
> `HANDOVER.md` に「API ではサブパスアプリを作れない」という記録があるが、それは
> 同一ドメインのサブパス（`pagebox.iodine2.net/d`）の話で、**別ホスト名なら API で作れる**。

出力された **AUD タグ**を `[env.stage.vars].ACCESS_AUD`（`TODO_STAGE_ACCESS_AUD`）に書き込む。

### 3. secret を入れる

```bash
make cf-stage-secret       # ADMIN_EMAILS のみ
```

**`CLOUDFLARE_API_TOKEN` は stage に入れない。** 本番スコープのトークンを stage に置かないため。
その結果 `/admin` の Analytics・ログイン履歴・システム状態のパネルは空欄になる（D1 由来の統計は出る）。

### 4. deploy

```bash
make stage-deploy-dry      # 設定ガード + wrangler --dry-run
make stage-deploy          # custom_domain が DNS レコードと証明書を自動発行する
make cf-stage-migrate      # D1 にマイグレーションを適用
```

`stage-deploy` / `stage-deploy-dry` / CI はいずれも **`make check-stage-config` を先に通します**
（`scripts/check-stage-config.ts`）。人の目視に頼らず、問題があれば deploy 前に止まります。

検証している内容:

1. `[env.stage].routes` が期待する2ホストと**完全一致**し、すべて `custom_domain` である
2. stage の routes が**本番の routes と重複しない**
3. `TODO_` プレースホルダが残っていない（未セットアップのまま deploy させない）
4. D1 / KV / R2 / Analytics / rate limit の各 binding が**本番と別の実体**を指している
   （定義漏れも検出する。非継承なら binding 欠落、継承されるなら本番共有になるため）
5. `APP_ORIGIN` / `VIEW_ORIGIN` のホスト名が stage の routes と一致している
6. stage で `workers_dev` / `preview_urls` が無効になっている

この判定は `bun test`（`scripts/check-stage-config.test.ts`）で回帰テストしてあります。
「stage の routes を本番ドメインに書き換えたら落ちる」ことも含めてテスト済みです。

そのうえで `wrangler --dry-run` が bindings の実値を出すので、`pagebox-stage` /
`pagebox-blobs-stage` / `pagebox_events_stage` を指していることも目視できます
（wrangler の `--dry-run` は routes を出力しないため、routes は上記ガードが受け持ちます）。

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
崩したら **`make check-stage-config` が落ちて deploy に進めない**（ローカルの `make stage-deploy` も
CI の stage workflow も同じゲートを通る）。

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
