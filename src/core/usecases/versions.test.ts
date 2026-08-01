// バージョン管理の usecase の回帰テスト。
// レビュー（PR #10）で指摘された同時更新のデータ破損を再現し、修正を固定するのが主目的。
import { beforeEach, describe, expect, test } from "bun:test";
import { FakeRepository, FakeStorage, bytes, html } from "./fakes";
import { uploadDocument } from "./upload-document";
import { addDocumentVersion } from "./add-document-version";
import { rollbackDocumentVersion } from "./rollback-document-version";
import { findVersionCandidates } from "./find-version-candidates";
import { getDocument } from "./get-document";
import { deleteDocument } from "./delete-document";
import { NotFoundError, ValidationError } from "../errors";

const GROUP = "group-1";
const OTHER_GROUP = "group-2";
const USER = "user-1";

let storage: FakeStorage;
let repo: FakeRepository;
let deps: { storage: FakeStorage; repo: FakeRepository };

beforeEach(() => {
  storage = new FakeStorage();
  repo = new FakeRepository();
  deps = { storage, repo };
});

function upload(
  name = "index.html",
  content = html("定例レポート", "<h1>v1</h1>", "第1版"),
  contentType = "text/html",
) {
  return uploadDocument(deps, {
    fileName: name,
    contentType,
    bytes: bytes(content),
    groupId: GROUP,
    uploadedBy: USER,
  });
}

function addVersion(slug: string, content: string, name = "index.html", groupId = GROUP) {
  return addDocumentVersion(deps, {
    fileName: name,
    contentType: "text/html",
    bytes: bytes(content),
    slug,
    groupId,
    createdBy: USER,
  });
}

describe("uploadDocument", () => {
  test("v1 を作り、title と description を HTML から取る", async () => {
    const meta = await upload();
    expect(meta.latestVersion).toBe(1);
    expect(meta.title).toBe("定例レポート");
    expect(meta.description).toBe("第1版");

    const versions = await repo.listVersions(meta.slug);
    expect(versions).toHaveLength(1);
    expect(storage.objects.has(versions[0].storageKey)).toBe(true);
  });

  // isHtmlUpload は「拡張子が .html/.htm」**または**「contentType が text/html」で受理する。
  // どちらか一方でも満たせば通るのが仕様（ブラウザが type を付けない場合があるため）。
  test("拡張子と contentType の両方が HTML でなければ拒否する", async () => {
    await expect(upload("a.txt", "plain", "text/plain")).rejects.toThrow(ValidationError);
  });

  test("拡張子だけ、あるいは contentType だけでも HTML なら受理する", async () => {
    await expect(upload("a.html", html("t", "x"), "text/plain")).resolves.toBeDefined();
    await expect(upload("a.txt", html("t", "x"), "text/html")).resolves.toBeDefined();
  });

  test("DB 書き込みが失敗したら自分が書いた blob を残さない", async () => {
    repo.failSave = () => true;
    await expect(upload()).rejects.toThrow("save failed");
    expect(storage.objects.size).toBe(0);
  });

  // addVersion と同じく、コミット済みなら参照中の blob を消してはいけない
  test("DB がコミット済みならエラーでも blob を残して成功を返す", async () => {
    repo.throwAfterSaveCommit = () => true;
    const meta = await upload();

    const served = await getDocument(deps, meta.slug);
    expect(served).not.toBeNull();
    expect(new TextDecoder().decode(served!.data)).toContain("v1");
  });
});

describe("addDocumentVersion", () => {
  test("版を追記し、共有 URL の単位（slug）は変わらない", async () => {
    const meta = await upload();
    const v2 = await addVersion(meta.slug, html("定例レポート", "<h1>v2</h1>", "第2版"));

    expect(v2.slug).toBe(meta.slug);
    expect(v2.version).toBe(2);
    const doc = await repo.findBySlug(meta.slug);
    expect(doc?.latestVersion).toBe(2);
    expect(doc?.description).toBe("第2版");
  });

  test("版ごとに別の blob キーを使う（上書きしない）", async () => {
    const meta = await upload();
    const v2 = await addVersion(meta.slug, html("定例レポート", "<h1>v2</h1>"));
    const v1 = await repo.findVersion(meta.slug, 1);

    expect(v2.storageKey).not.toBe(v1!.storageKey);
    expect(storage.objects.size).toBe(2);
  });

  test("他グループのドキュメントには追記できない（blob も書かない）", async () => {
    const meta = await upload();
    const before = storage.objects.size;
    await expect(addVersion(meta.slug, html("x", "y"), "index.html", OTHER_GROUP))
      .rejects.toThrow(NotFoundError);
    expect(storage.objects.size).toBe(before);
  });

  test("存在しない slug は NotFound", async () => {
    await expect(addVersion("doesnotexist", html("x", "y"))).rejects.toThrow(NotFoundError);
  });

  // ── レビュー指摘の回帰テスト ──────────────────────────────
  // 修正前は A/B が同じ `{slug}-v2.html` に put するため、
  // 「DB は勝者のメタデータ・blob は敗者の中身」という食い違いが起きていた。
  test("同時に版を追加しても DB のメタデータと blob の中身が食い違わない", async () => {
    const meta = await upload();

    const [a, b] = await Promise.all([
      addVersion(meta.slug, html("A", "<h1>A の中身</h1>")),
      addVersion(meta.slug, html("B", "<h1>B の中身</h1>")),
    ]);

    // 競合しても両方が別の版として成立する（片方が v2、もう片方が v3）
    expect([a.version, b.version].sort()).toEqual([2, 3]);

    // すべての版で「DB の title」と「blob の中身」が対応していること
    for (const v of await repo.listVersions(meta.slug)) {
      const stored = storage.objects.get(v.storageKey);
      expect(stored).toBeDefined();
      const body = new TextDecoder().decode(stored!);
      expect(body).toContain(`<title>${v.title}</title>`);
    }
  });

  test("同時追加でも版番号が飛ばず、最新版が実際の最大版になる", async () => {
    const meta = await upload();
    await Promise.all([
      addVersion(meta.slug, html("A", "<h1>A</h1>")),
      addVersion(meta.slug, html("B", "<h1>B</h1>")),
      addVersion(meta.slug, html("C", "<h1>C</h1>")),
    ]);

    const versions = await repo.listVersions(meta.slug);
    expect(versions.map((v) => v.version)).toEqual([4, 3, 2, 1]);
    const doc = await repo.findBySlug(meta.slug);
    expect(doc?.latestVersion).toBe(4);
  });

  test("DB 書き込みが失敗したら自分が書いた blob を残さない", async () => {
    const meta = await upload();
    const before = new Set(storage.objects.keys());
    repo.failAddVersion = () => true;

    await expect(addVersion(meta.slug, html("x", "y"))).rejects.toThrow("addVersion failed");
    // 孤児 blob が増えていないこと
    expect(new Set(storage.objects.keys())).toEqual(before);
  });

  // DB がコミットしたのにレスポンスだけ失われるケース。
  // blob を先に消すと、DB から参照されている blob を削除してその版が恒久的に 404 になる。
  test("DB がコミット済みならエラーでも参照中の blob を消さず成功として扱う", async () => {
    const meta = await upload();
    repo.throwAfterAddVersionCommit = (v) => v.version === 2;

    const v2 = await addVersion(meta.slug, html("定例レポート", "<h1>v2 の中身</h1>"));
    expect(v2.version).toBe(2);

    // 版が配信できること（blob が消えていない）
    const served = await getDocument(deps, meta.slug, 2);
    expect(served).not.toBeNull();
    expect(new TextDecoder().decode(served!.data)).toContain("v2 の中身");
    // 版が二重に作られていないこと
    expect((await repo.listVersions(meta.slug)).map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("rollbackDocumentVersion", () => {
  test("指定した版の中身を複製して新しい最新版にする（過去版は消えない）", async () => {
    const meta = await upload("index.html", html("定例レポート", "<h1>v1 の中身</h1>", "第1版"));
    await addVersion(meta.slug, html("定例レポート", "<h1>v2 の中身</h1>", "第2版"));

    const v3 = await rollbackDocumentVersion(deps, {
      slug: meta.slug, version: 1, groupId: GROUP, createdBy: USER,
    });

    expect(v3.version).toBe(3);
    expect(v3.sourceVersion).toBe(1);

    // 最新版の中身が v1 と一致する
    const latest = await getDocument(deps, meta.slug);
    expect(new TextDecoder().decode(latest!.data)).toContain("v1 の中身");

    // append-only: v1 / v2 は残っている
    const versions = await repo.listVersions(meta.slug);
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    const v1 = await getDocument(deps, meta.slug, 1);
    expect(new TextDecoder().decode(v1!.data)).toContain("v1 の中身");
  });

  test("存在しない版・他グループは NotFound", async () => {
    const meta = await upload();
    await expect(rollbackDocumentVersion(deps, { slug: meta.slug, version: 99, groupId: GROUP, createdBy: USER }))
      .rejects.toThrow(NotFoundError);
    await expect(rollbackDocumentVersion(deps, { slug: meta.slug, version: 1, groupId: OTHER_GROUP, createdBy: USER }))
      .rejects.toThrow(NotFoundError);
  });
});

describe("getDocument", () => {
  test("version 未指定なら最新版、指定すればその版を storage_key 経由で返す", async () => {
    const meta = await upload("index.html", html("t", "<h1>v1</h1>"));
    await addVersion(meta.slug, html("t", "<h1>v2</h1>"));

    const latest = await getDocument(deps, meta.slug);
    expect(latest!.version.version).toBe(2);
    expect(new TextDecoder().decode(latest!.data)).toContain("v2");

    const pinned = await getDocument(deps, meta.slug, 1);
    expect(new TextDecoder().decode(pinned!.data)).toContain("v1");
  });

  // バージョン管理導入前の blob は `{slug}.html` のまま残る
  test("旧キーの版でも storage_key 経由で配信できる", async () => {
    const meta = await upload();
    const legacyKey = `${meta.slug}.html`;
    storage.objects.set(legacyKey, bytes(html("旧", "<h1>legacy</h1>")));
    const v1 = repo.versions.find((v) => v.slug === meta.slug && v.version === 1)!;
    v1.storageKey = legacyKey;

    const r = await getDocument(deps, meta.slug, 1);
    expect(new TextDecoder().decode(r!.data)).toContain("legacy");
  });

  test("存在しない版は null", async () => {
    const meta = await upload();
    expect(await getDocument(deps, meta.slug, 99)).toBeNull();
  });
});

describe("deleteDocument", () => {
  test("全版の blob を消し、削除した版を返す", async () => {
    const meta = await upload();
    await addVersion(meta.slug, html("t", "<h1>v2</h1>"));

    const deleted = await deleteDocument(deps, meta.slug, GROUP);
    expect(deleted?.map((v) => v.version)).toEqual([2, 1]);
    expect(storage.objects.size).toBe(0);
    expect(await repo.findBySlug(meta.slug)).toBeNull();
  });

  // blob を先に消すと、途中失敗で「DB にはあるのに 404」の壊れた文書ができる
  test("blob 削除が失敗しても壊れた文書を残さない（DB を先に消す）", async () => {
    const meta = await upload();
    await addVersion(meta.slug, html("t", "<h1>v2</h1>"));
    storage.failDelete = () => true;

    const deleted = await deleteDocument(deps, meta.slug, GROUP);
    expect(deleted).not.toBeNull();
    // DB からは消えている（孤児 blob は残るが参照されない）
    expect(await repo.findBySlug(meta.slug)).toBeNull();
    expect(await getDocument(deps, meta.slug)).toBeNull();
  });

  test("他グループは削除できず blob も消えない", async () => {
    const meta = await upload();
    expect(await deleteDocument(deps, meta.slug, OTHER_GROUP)).toBeNull();
    expect(storage.objects.size).toBe(1);
  });
});

describe("findVersionCandidates", () => {
  test("同じファイル名を候補に出す", async () => {
    const meta = await upload("index.html");
    const r = await findVersionCandidates(deps, {
      fileName: "index.html", headSnippet: html("別タイトル", ""), groupId: GROUP, contentType: "text/html",
    });
    expect(r.candidates.map((c) => c.slug)).toEqual([meta.slug]);
  });

  test("ファイル名が違っても同じ title なら候補に出す", async () => {
    const meta = await upload("index.html", html("定例レポート", "<h1>v1</h1>"));
    const r = await findVersionCandidates(deps, {
      fileName: "renamed.html", headSnippet: html("定例レポート", ""), groupId: GROUP, contentType: "text/html",
    });
    expect(r.candidates.map((c) => c.slug)).toEqual([meta.slug]);
  });

  test("無関係な文書は候補に出さない", async () => {
    await upload("index.html", html("定例レポート", "<h1>v1</h1>"));
    const r = await findVersionCandidates(deps, {
      fileName: "other.html", headSnippet: html("まったく別の資料", ""), groupId: GROUP, contentType: "text/html",
    });
    expect(r.candidates).toEqual([]);
  });

  test("他グループの文書は候補に出さない", async () => {
    await upload("index.html");
    const r = await findVersionCandidates(deps, {
      fileName: "index.html", headSnippet: html("定例レポート", ""), groupId: OTHER_GROUP, contentType: "text/html",
    });
    expect(r.candidates).toEqual([]);
  });

  // 先頭 4KB しか送らない設計上のトレードオフ。false negative は「新規文書ができる」で回復可能
  test("title がスニペットの外にあると候補を見逃す（既知のトレードオフ）", async () => {
    await upload("index.html", html("定例レポート", "<h1>v1</h1>"));
    const r = await findVersionCandidates(deps, {
      fileName: "renamed.html", headSnippet: "<!doctype html><html><head>", groupId: GROUP, contentType: "text/html",
    });
    expect(r.candidates).toEqual([]);
  });
});
