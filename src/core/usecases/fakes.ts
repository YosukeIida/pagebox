// usecase テスト用の in-memory な StoragePort / DocumentRepository。
// 本番アダプタ（d1 / drizzle / r2 / fs）と同じ契約を最小限で再現する。
//
// 重要な再現ポイント:
//   - `document_versions` の PK (slug, version) 制約 → 同時追加の勝者を1人に決める
//   - blob は「同じキーに put すると後勝ちで上書き」→ キー共有時の取り違えを検出できる
//   - 任意の操作で失敗を注入できる（部分失敗の検証用）
import type { StoragePort } from "../../ports/storage";
import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta, DocumentVersion } from "../document";

export class FakeStorage implements StoragePort {
  readonly objects = new Map<string, Uint8Array>();
  // put/delete の呼び出し順（順序の検証に使う）
  readonly calls: string[] = [];
  // キーごとに1回だけ失敗させる注入ポイント
  failPut?: (key: string) => boolean;
  failDelete?: (key: string) => boolean;

  async put(key: string, data: Uint8Array): Promise<void> {
    this.calls.push(`put:${key}`);
    if (this.failPut?.(key)) throw new Error(`put failed: ${key}`);
    this.objects.set(key, data);
  }

  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.calls.push(`delete:${key}`);
    if (this.failDelete?.(key)) throw new Error(`delete failed: ${key}`);
    this.objects.delete(key);
  }
}

export class FakeRepository implements DocumentRepository {
  readonly docs = new Map<string, DocumentMeta>();
  readonly versions: DocumentVersion[] = [];
  // 書き込む前に失敗させる（DB に届かなかった障害の再現）
  failAddVersion?: (v: DocumentVersion) => boolean;
  failSave?: (doc: DocumentMeta) => boolean;
  // **書き込んだ後に**失敗させる（コミットしたがレスポンスが失われた障害の再現）。
  // このとき blob を消してしまうと、参照されている blob を削除して恒久的に 404 になる。
  throwAfterAddVersionCommit?: (v: DocumentVersion) => boolean;
  throwAfterSaveCommit?: (doc: DocumentMeta) => boolean;

  async save(doc: DocumentMeta, first: DocumentVersion): Promise<void> {
    if (this.failSave?.(doc)) throw new Error("save failed");
    if (this.docs.has(doc.slug)) throw new Error(`duplicate slug: ${doc.slug}`);
    this.docs.set(doc.slug, { ...doc });
    this.versions.push({ ...first });
    if (this.throwAfterSaveCommit?.(doc)) throw new Error("save committed but response lost");
  }

  async addVersion(version: DocumentVersion): Promise<void> {
    if (this.failAddVersion?.(version)) throw new Error("addVersion failed");
    // PK (slug, version) 制約。ここが同時更新の勝者を決める
    const exists = this.versions.some((v) => v.slug === version.slug && v.version === version.version);
    if (exists) throw new Error(`UNIQUE constraint failed: (${version.slug}, ${version.version})`);

    this.versions.push({ ...version });
    const doc = this.docs.get(version.slug);
    if (!doc) throw new Error(`document not found: ${version.slug}`);
    // documents 側の最新版スナップショットを更新する（本番アダプタと同じ）
    this.docs.set(version.slug, {
      ...doc,
      title: version.title,
      description: version.description,
      originalName: version.originalName,
      size: version.size,
      contentType: version.contentType,
      latestVersion: version.version,
      updatedAt: version.createdAt,
    });
    if (this.throwAfterAddVersionCommit?.(version)) {
      throw new Error("addVersion committed but response lost");
    }
  }

  async findBySlug(slug: string): Promise<DocumentMeta | null> {
    const d = this.docs.get(slug);
    return d ? { ...d } : null;
  }

  async findVersion(slug: string, version: number): Promise<DocumentVersion | null> {
    const v = this.versions.find((x) => x.slug === slug && x.version === version);
    return v ? { ...v } : null;
  }

  async listVersions(slug: string): Promise<DocumentVersion[]> {
    return this.versions
      .filter((v) => v.slug === slug)
      .sort((a, b) => b.version - a.version)
      .map((v) => ({ ...v }));
  }

  async findByNameOrTitle(groupId: string, originalName: string, title: string | null): Promise<DocumentMeta[]> {
    return [...this.docs.values()]
      .filter((d) => d.groupId === groupId && (d.originalName === originalName || (title !== null && d.title === title)))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5)
      .map((d) => ({ ...d }));
  }

  async list(groupId: string): Promise<DocumentMeta[]> {
    return [...this.docs.values()]
      .filter((d) => d.groupId === groupId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((d) => ({ ...d }));
  }

  async delete(slug: string): Promise<void> {
    this.docs.delete(slug);
    for (let i = this.versions.length - 1; i >= 0; i--) {
      if (this.versions[i].slug === slug) this.versions.splice(i, 1);
    }
  }
}

// テスト用の HTML を組み立てる
export function html(title: string, body: string, description?: string): string {
  const meta = description ? `<meta name="description" content="${description}">` : "";
  return `<!doctype html><html><head><title>${title}</title>${meta}</head><body>${body}</body></html>`;
}

export function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
