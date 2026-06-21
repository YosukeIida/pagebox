import type { DocumentMeta } from "../../core/document";
import { SiteHeader } from "./components/SiteHeader";
import { Button } from "./components/Button";
import { DropZone } from "./components/DropZone";
import { ResultBox } from "./components/ResultBox";
import { ErrorMsg } from "./components/ErrorMsg";
import { DocCard } from "./components/DocCard";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

export function HomePage(props: { documents: DocumentMeta[]; email: string }) {
  return (
    <div>
      <SiteHeader email={props.email} />

      <main class="container">
        <section class="hero">
          <h1>HTML を、ドラッグするだけで共有</h1>
          <p>自己完結した HTML ファイルをアップロードして、すぐに共有可能な URL を発行します。</p>
        </section>

        <DropZone
          id="dropzone"
          role="button"
          tabindex={0}
          aria-label="HTML ファイルをドロップまたはクリックしてアップロード"
        >
          <p><strong>クリックまたはドラッグ＆ドロップ</strong></p>
          <p>.html / .htm ファイル（最大 10MB）</p>
          <input type="file" id="fileInput" accept=".html,.htm" class="hidden" />
        </DropZone>

        <ResultBox id="result" hidden>
          <div class="result-url">
            <a id="resultLink" href="#" target="_blank" rel="noopener noreferrer"></a>
          </div>
          <Button variant="primary" id="copyBtn">コピー</Button>
          <Button variant="secondary" id="openBtn" href="#" target="_blank" rel="noopener noreferrer">開く</Button>
        </ResultBox>
        <ErrorMsg id="errorMsg" hidden />

        <p class="section-title">アップロード済み</p>
        <div id="docList" class="doc-list">
          {props.documents.length === 0 ? (
            <div class="empty-state">
              <p>まだドキュメントがありません</p>
            </div>
          ) : (
            props.documents.map((doc) => (
              <DocCard
                id={`doc-${doc.slug}`}
                key={doc.slug}
                title={doc.title}
                meta={`${formatDate(doc.createdAt)} · ${formatSize(doc.size)}`}
                actions={
                  <>
                    <Button variant="secondary" href={`https://view.pagebox.iodine2.net/${doc.slug}`} target="_blank" rel="noopener noreferrer">
                      開く
                    </Button>
                    <Button variant="secondary" data-copy-url={`https://view.pagebox.iodine2.net/${doc.slug}`}>
                      URLコピー
                    </Button>
                    <Button variant="danger" data-delete-slug={doc.slug}>
                      削除
                    </Button>
                  </>
                }
              />
            ))
          )}
        </div>
      </main>
    </div>
  );
}
