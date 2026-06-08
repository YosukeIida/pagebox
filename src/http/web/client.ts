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
  const resultLink = document.getElementById("resultLink") as HTMLAnchorElement | null;
  const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement | null;
  const openBtn = document.getElementById("openBtn") as HTMLAnchorElement | null;
  const errorMsg = document.getElementById("errorMsg") as HTMLElement | null;

  function showError(msg: string) {
    if (errorMsg) {
      errorMsg.textContent = msg;
      errorMsg.classList.remove("hidden");
    }
    result?.classList.add("hidden");
  }

  function showResult(url: string) {
    if (result && resultLink && openBtn) {
      resultLink.href = url;
      resultLink.textContent = url;
      openBtn.href = url;
      result.classList.remove("hidden");
    }
    errorMsg?.classList.add("hidden");
  }

  async function uploadFile(file: File) {
    if (!/\.html?$/i.test(file.name)) {
      showError(".html または .htm ファイルのみアップロードできます");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.status === 201) {
        const url = location.origin + data.url;
        showResult(url);
        location.reload();
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

  // 一覧: コピー・削除ボタン
  document.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    const copyUrl = target.closest("[data-copy-url]")?.getAttribute("data-copy-url");
    if (copyUrl) {
      const url = location.origin + copyUrl;
      await navigator.clipboard.writeText(url);
      target.textContent = "コピー済み！";
      setTimeout(() => { target.textContent = "URLコピー"; }, 2000);
      return;
    }

    const deleteSlug = target.closest("[data-delete-slug]")?.getAttribute("data-delete-slug");
    if (deleteSlug) {
      const res = await fetch(`/api/documents/${deleteSlug}`, { method: "DELETE" });
      if (res.status === 204) {
        document.getElementById(`doc-${deleteSlug}`)?.remove();
      }
    }
  });
})();
