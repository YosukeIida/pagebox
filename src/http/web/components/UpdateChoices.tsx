// 同名 / 同 title 検出時の選択肢（ラジオ行）。
// 「既存ドキュメントの新バージョンにする」か「別のドキュメントとして新規公開する」かを選ばせる。
// value が slug なら更新、空文字なら新規。この markup は
// POST /api/upload/check のレスポンス（candidatesHtml）としても SSR して返すため、
// クライアント側で組み立てず必ずここを通す。
import type { DocumentMeta } from "../../../core/document";
import { formatDate } from "../format";

interface UpdateChoicesProps {
  candidates: DocumentMeta[];
}

export function UpdateChoices(props: UpdateChoicesProps) {
  return (
    <>
      {props.candidates.map((doc, i) => (
        <label class="choice-option" key={doc.slug}>
          <input type="radio" name="updateTarget" value={doc.slug} checked={i === 0} />
          <span class="choice-option-body">
            <span class="choice-option-title">{doc.title}</span>
            <span class="choice-option-meta">
              v{doc.latestVersion} · {formatDate(doc.updatedAt)} · {doc.originalName}
            </span>
            <span class="choice-option-note">v{doc.latestVersion + 1} として更新する</span>
          </span>
        </label>
      ))}
      <label class="choice-option">
        <input type="radio" name="updateTarget" value="" />
        <span class="choice-option-body">
          <span class="choice-option-title">別のドキュメントとして新規公開</span>
          <span class="choice-option-meta">新しい共有 URL を発行します</span>
        </span>
      </label>
    </>
  );
}
