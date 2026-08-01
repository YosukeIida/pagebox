// クライアントサイド TS — Bun.Transpiler で起動時にトランスパイルして配信
(function () {
  // テーマ初期化
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  const themeToggle = document.getElementById("themeToggle") as HTMLButtonElement | null;
  themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    if (themeToggle) themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // ドロップゾーン
  const dropzone = document.getElementById("dropzone") as HTMLElement | null;
  const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
  const result = document.getElementById("result") as HTMLElement | null;
  const resultMsg = document.getElementById("resultMsg") as HTMLElement | null;
  const resultLink = document.getElementById("resultLink") as HTMLAnchorElement | null;
  const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement | null;
  const openBtn = document.getElementById("openBtn") as HTMLAnchorElement | null;
  const errorMsg = document.getElementById("errorMsg") as HTMLElement | null;
  const updateDialog = document.getElementById("updateDialog") as HTMLElement | null;

  function showError(msg: string) {
    if (errorMsg) {
      errorMsg.textContent = msg;
      errorMsg.classList.remove("hidden");
    }
    result?.classList.add("hidden");
  }

  function showResult(url: string, message?: string) {
    if (result && resultLink && openBtn) {
      resultLink.href = url;
      resultLink.textContent = url;
      openBtn.href = url;
      if (resultMsg) resultMsg.textContent = message ?? "";
      result.classList.remove("hidden");
    }
    errorMsg?.classList.add("hidden");
  }

  // 一覧を更新するため成功後にリロードするが、それだけでは結果表示が消えてしまうので
  // メッセージを sessionStorage で次のページロードに引き継ぐ。
  const FLASH_KEY = "pagebox:flash";

  function reloadWithFlash(url: string, message: string) {
    try {
      sessionStorage.setItem(FLASH_KEY, JSON.stringify({ url, message }));
    } catch { /* 保存できなくてもリロードは行う */ }
    location.reload();
  }

  const flash = sessionStorage.getItem(FLASH_KEY);
  if (flash) {
    sessionStorage.removeItem(FLASH_KEY);
    try {
      const parsed = JSON.parse(flash) as { url?: string; message?: string };
      if (parsed.url) showResult(parsed.url, parsed.message);
    } catch { /* 壊れた値は無視 */ }
  }

  // ---- 同名 / 同 title 検出 ----

  // <title> はほぼ確実に head 内にあるため、判定には先頭 4KB だけ送る（10MB を二度送らない）
  async function readHead(file: File): Promise<string> {
    try {
      return await file.slice(0, 4096).text();
    } catch {
      return "";
    }
  }

  // 選択ダイアログを開いて結果を待つ。
  // 戻り値: null = キャンセル、"" = 新規公開、slug = その slug の新しいバージョン
  function askUpdateChoice(candidatesHtml: string): Promise<string | null> {
    const dialog = updateDialog;
    const body = dialog?.querySelector(".choice-body") as HTMLElement | null;
    const confirmBtn = dialog?.querySelector("[data-choice-confirm]") as HTMLElement | null;
    const cancelBtn = dialog?.querySelector("[data-choice-cancel]") as HTMLElement | null;
    if (!dialog || !body || !confirmBtn || !cancelBtn) return Promise.resolve("");
    return waitForChoice(dialog, body, confirmBtn, cancelBtn, candidatesHtml);
  }

  function waitForChoice(
    dialog: HTMLElement,
    body: HTMLElement,
    confirmBtn: HTMLElement,
    cancelBtn: HTMLElement,
    candidatesHtml: string,
  ): Promise<string | null> {
    // 選択肢の markup はサーバ（UpdateChoices）が SSR したものをそのまま差し込む
    body.innerHTML = candidatesHtml;
    dialog.classList.remove("hidden");

    return new Promise<string | null>((resolve) => {
      function cleanup() {
        dialog.classList.add("hidden");
        body.innerHTML = "";
        confirmBtn.removeEventListener("click", onConfirm);
        cancelBtn.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKey);
      }
      function onConfirm() {
        const checked = body.querySelector('input[name="updateTarget"]:checked') as HTMLInputElement | null;
        cleanup();
        resolve(checked ? checked.value : "");
      }
      function onCancel() {
        cleanup();
        resolve(null);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") onCancel();
      }
      confirmBtn.addEventListener("click", onConfirm);
      cancelBtn.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKey);
    });
  }

  // 送信先を決める。
  // target: null = キャンセル / "" = 新規公開 / slug = その slug の新しいバージョン
  // checkFailed: 候補判定そのものが失敗した（新規として続行するが、ユーザーに伝える）
  async function resolveUploadTarget(
    file: File,
  ): Promise<{ target: string | null; checkFailed: boolean }> {
    let data: { candidatesHtml?: string } | null = null;
    let checkFailed = false;
    try {
      const res = await fetch("/api/upload/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "text/html",
          headSnippet: await readHead(file),
        }),
      });
      if (res.ok) data = await res.json();
      else checkFailed = true;
    } catch {
      checkFailed = true;
    }

    // 判定に失敗してもアップロードは止めない（一時的な失敗で公開できなくなる方が損）。
    // ただし黙って新規扱いにはせず、結果表示でその旨を伝える。
    if (!data || !data.candidatesHtml) return { target: "", checkFailed };
    return { target: await askUpdateChoice(data.candidatesHtml), checkFailed: false };
  }

  async function uploadFile(file: File) {
    if (!/\.html?$/i.test(file.name)) {
      showError(".html または .htm ファイルのみアップロードできます");
      return;
    }

    const { target, checkFailed } = await resolveUploadTarget(file);
    if (target === null) return; // キャンセル

    const form = new FormData();
    form.append("file", file);
    const endpoint = target
      ? `/api/documents/${encodeURIComponent(target)}/versions`
      : "/api/upload";
    try {
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = await res.json();
      if (res.status === 201) {
        const message = checkFailed
          ? "既存ドキュメントの確認に失敗したため新規として公開しました"
          : target
            ? `v${data.version} を公開しました`
            : "公開しました";
        reloadWithFlash(data.url, message);
      } else {
        showError(data.error ?? "アップロードに失敗しました");
      }
    } catch {
      showError("ネットワークエラーが発生しました");
    }
  }

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer?.files[0];
    if (file) uploadFile(file);
  });

  dropzone?.addEventListener("click", () => fileInput?.click());
  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") fileInput?.click();
  });

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) uploadFile(file);
  });

  copyBtn?.addEventListener("click", () => {
    const url = resultLink?.href ?? "";
    if (url) navigator.clipboard.writeText(url).then(() => {
      if (copyBtn) copyBtn.textContent = "コピー済み！";
      setTimeout(() => { if (copyBtn) copyBtn.textContent = "コピー"; }, 2000);
    });
  });

  // ---- 共有ポップオーバー ----

  function closeSharePopovers() {
    document.querySelectorAll(".share-host").forEach((host) => {
      host.classList.add("hidden");
      host.innerHTML = "";
    });
    document.querySelectorAll("[data-share-slug]").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  async function toggleSharePopover(slug: string) {
    const host = document.getElementById(`share-${slug}`);
    if (!host) return;
    const wasOpen = !host.classList.contains("hidden");
    closeSharePopovers();
    if (wasOpen) return;

    host.classList.remove("hidden");
    host.textContent = "読み込み中…";
    document
      .querySelector(`[data-share-slug="${slug}"]`)
      ?.setAttribute("aria-expanded", "true");
    try {
      // markup はサーバ（SharePanel）が SSR する。クライアントでは DOM を組み立てない。
      const res = await fetch(`/docs/${encodeURIComponent(slug)}/share`);
      if (!res.ok) throw new Error(String(res.status));
      host.innerHTML = await res.text();
    } catch {
      host.textContent = "バージョン履歴の取得に失敗しました";
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSharePopovers();
  });

  // 一覧: 共有・コピー・戻す・削除
  document.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    const shareSlug = target.closest("[data-share-slug]")?.getAttribute("data-share-slug");
    if (shareSlug) {
      await toggleSharePopover(shareSlug);
      return;
    }

    const copyEl = target.closest("[data-copy-url]") as HTMLElement | null;
    if (copyEl) {
      const url = copyEl.getAttribute("data-copy-url") ?? "";
      const label = copyEl.textContent;
      await navigator.clipboard.writeText(url);
      copyEl.textContent = "コピー済み！";
      setTimeout(() => { copyEl.textContent = label; }, 2000);
      return;
    }

    const rollbackEl = target.closest("[data-rollback-slug]") as HTMLElement | null;
    if (rollbackEl) {
      const slug = rollbackEl.getAttribute("data-rollback-slug") ?? "";
      const version = rollbackEl.getAttribute("data-rollback-version") ?? "";
      if (!confirm(`v${version} の内容を新しいバージョンとして公開します。よろしいですか？`)) return;
      try {
        const res = await fetch(
          `/api/documents/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/rollback`,
          { method: "POST" },
        );
        const data = await res.json();
        if (res.status === 201) {
          reloadWithFlash(data.url, `v${version} を v${data.version} として復元しました`);
        } else {
          showError(data.error ?? "復元に失敗しました");
        }
      } catch {
        showError("ネットワークエラーが発生しました");
      }
      return;
    }

    const deleteSlug = target.closest("[data-delete-slug]")?.getAttribute("data-delete-slug");
    if (deleteSlug) {
      const res = await fetch(`/api/documents/${encodeURIComponent(deleteSlug)}`, { method: "DELETE" });
      if (res.status === 204) {
        closeSharePopovers();
        document.getElementById(`doc-${deleteSlug}`)?.remove();
      }
      return;
    }

    // ポップオーバー外のクリックで閉じる（ダイアログ内のクリックは無視）
    if (!target.closest(".share-popover") && !target.closest(".choice-overlay")) {
      closeSharePopovers();
    }
  });
})();
