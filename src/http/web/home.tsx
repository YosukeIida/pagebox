import type { DocumentMeta } from "../../core/document";

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
      <header class="site-header">
        <div class="container" style="display:flex;align-items:center;justify-content:space-between;width:100%">
          <a href="/" class="site-logo">pagebox</a>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="user-email">{props.email}</span>
            <button class="theme-toggle" id="themeToggle">🌙</button>
          </div>
        </div>
      </header>

      <main class="container">
        <section class="hero">
          <h1>HTML を、ドラッグするだけで共有</h1>
          <p>自己完結した HTML ファイルをアップロードして、すぐに共有可能な URL を発行します。</p>
        </section>

        <div
          id="dropzone"
          class="dropzone"
          role="button"
          tabindex={0}
          aria-label="HTML ファイルをドロップまたはクリックしてアップロード"
        >
          <div class="dropzone-icon">📄</div>
          <p><strong>クリックまたはドラッグ＆ドロップ</strong></p>
          <p>.html / .htm ファイル（最大 10MB）</p>
          <input type="file" id="fileInput" accept=".html,.htm" style="display:none" />
        </div>

        <div id="result" class="result-box hidden">
          <div class="result-url">
            <a id="resultLink" href="#" target="_blank" rel="noopener noreferrer"></a>
          </div>
          <button class="btn btn-primary" id="copyBtn">コピー</button>
          <a class="btn btn-secondary" id="openBtn" href="#" target="_blank" rel="noopener noreferrer">開く</a>
        </div>
        <p id="errorMsg" class="error-msg hidden"></p>

        <p class="section-title">アップロード済み</p>
        <div id="docList" class="doc-list">
          {props.documents.length === 0 ? (
            <div class="empty-state">
              <p>まだドキュメントがありません</p>
            </div>
          ) : (
            props.documents.map((doc) => (
              <div class="doc-card" id={`doc-${doc.slug}`} key={doc.slug}>
                <div class="doc-info">
                  <div class="doc-title">{doc.title}</div>
                  <div class="doc-meta">
                    {formatDate(doc.createdAt)} · {formatSize(doc.size)}
                  </div>
                </div>
                <div class="doc-actions">
                  <a class="btn btn-secondary" href={`/d/${doc.slug}`} target="_blank" rel="noopener noreferrer">
                    開く
                  </a>
                  <button class="btn btn-secondary" data-copy-url={`/d/${doc.slug}`}>
                    URLコピー
                  </button>
                  <button class="btn btn-danger" data-delete-slug={doc.slug}>
                    削除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
