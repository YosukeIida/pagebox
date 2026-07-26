import type { DocumentRepository } from "../../ports/repository";
import type { DocumentMeta } from "../document";
import { deriveTitle, isHtmlUpload } from "../document";

export interface CandidateInput {
  fileName: string;
  contentType?: string;
  // ファイル先頭の数 KB のテキスト。<title> はほぼ確実に head 内にあるため、
  // 10MB 全体を送らせずにここから title を推定する。
  headSnippet: string;
  groupId: string;
}

export interface CandidateResult {
  // アップロードされようとしているファイルから推定したタイトル
  title: string;
  // 「同じドキュメントの新バージョンでは？」と提示する既存ドキュメント（更新の新しい順・最大5件）
  candidates: DocumentMeta[];
}

// アップロード前に「新規か既存の更新か」を判定するための候補探索。
// ファイル名の一致と、HTML の <title> の一致の両方を見る
// （Claude Code が生成する HTML は index.html のように名前が被りやすく、
//  逆に名前を変えても title は同じままというケースもあるため）。
export async function findVersionCandidates(
  deps: { repo: DocumentRepository },
  input: CandidateInput,
): Promise<CandidateResult> {
  const title = deriveTitle(input.headSnippet, input.fileName);
  if (!isHtmlUpload(input.fileName, input.contentType ?? "")) {
    return { title, candidates: [] };
  }
  const candidates = await deps.repo.findByNameOrTitle(input.groupId, input.fileName, title);
  return { title, candidates };
}
