import type { DocumentMeta } from "../../core/document";
import type { Origins } from "../../core/urls";
import { viewUrl } from "../../core/urls";
import { SiteHeader } from "./components/SiteHeader";
import { Button } from "./components/Button";
import { Badge } from "./components/Badge";
import { DropZone } from "./components/DropZone";
import { ResultBox } from "./components/ResultBox";
import { ErrorMsg } from "./components/ErrorMsg";
import { DocCard } from "./components/DocCard";
import { ChoiceDialog } from "./components/ChoiceDialog";
import { formatDate, formatSize } from "./format";

export function HomePage(props: { documents: DocumentMeta[]; email: string; origins: Origins }) {
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
          <span id="resultMsg" class="result-msg"></span>
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
              // 共有ポップオーバーはカードの直下に絶対配置するため、カードごとに包む
              <div class="doc-item" id={`doc-${doc.slug}`} key={doc.slug}>
                <DocCard
                  title={
                    <>
                      <span class="doc-title-text">{doc.title}</span>
                      <Badge variant="version">v{doc.latestVersion}</Badge>
                    </>
                  }
                  meta={`更新 ${formatDate(doc.updatedAt)} · ${formatSize(doc.size)} · ${doc.latestVersion} versions`}
                  actions={
                    <>
                      <Button variant="secondary" data-share-slug={doc.slug} aria-expanded="false">
                        共有
                      </Button>
                      <Button
                        variant="secondary"
                        href={viewUrl(props.origins, doc.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        開く
                      </Button>
                      <Button variant="danger" data-delete-slug={doc.slug}>
                        削除
                      </Button>
                    </>
                  }
                />
                {/* client.ts が GET /docs/:slug/share の fragment を差し込む */}
                <div class="share-host hidden" id={`share-${doc.slug}`}></div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* 同名 / 同 title 検出時の選択ダイアログ。選択肢は client.ts が
          POST /api/upload/check の candidatesHtml で埋める（markup は UpdateChoices が正）。 */}
      <ChoiceDialog id="updateDialog" hidden title="同じ名前のドキュメントがあります" confirmLabel="決定" />
    </div>
  );
}
