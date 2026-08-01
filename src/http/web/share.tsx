// 共有ポップオーバーの中身（実画面）。GET /docs/:slug/share が SSR して HTML fragment として返し、
// client.ts が DocCard 直下に差し込む。一覧の SSR に全ドキュメント分の全版を埋め込むと
// N+1 になるため、開いたときだけ取得する構成にしている。
import type { DocumentMeta, DocumentVersion } from "../../core/document";
import type { Origins } from "../../core/urls";
import { viewUrl } from "../../core/urls";
import { SharePopover } from "./components/SharePopover";
import { VersionList } from "./components/VersionList";
import { VersionRow } from "./components/VersionRow";
import { Button } from "./components/Button";

export function SharePanel(props: { doc: DocumentMeta; versions: DocumentVersion[]; origins: Origins }) {
  const { doc, versions, origins } = props;
  return (
    <SharePopover url={viewUrl(origins, doc.slug)}>
      <VersionList currentVersion={doc.latestVersion}>
        {versions.map((v) => {
          const latest = v.version === doc.latestVersion;
          // 最新版の URL は共有 URL（ポップオーバー上部）と同じなのでコピーボタンを重複させない
          const url = viewUrl(origins, doc.slug, latest ? undefined : v.version);
          return (
            <VersionRow
              key={v.version}
              version={v.version}
              createdAt={v.createdAt}
              size={v.size}
              latest={latest}
              sourceVersion={v.sourceVersion}
              actions={
                <>
                  <Button variant="secondary" href={url} target="_blank" rel="noopener noreferrer">
                    開く
                  </Button>
                  {latest ? null : (
                    <>
                      <Button variant="secondary" type="button" data-copy-url={url}>URLコピー</Button>
                      <Button
                        variant="secondary"
                        type="button"
                        data-rollback-slug={doc.slug}
                        data-rollback-version={String(v.version)}
                      >
                        この版に戻す
                      </Button>
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </VersionList>
    </SharePopover>
  );
}
