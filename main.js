const state = {
  rawRows: [],
  scoredRows: [],
  filteredRows: []
};

const els = {
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("fileInput"),
  urlInput: document.getElementById("urlInput"),
  loadUrlBtn: document.getElementById("loadUrlBtn"),
  csvText: document.getElementById("csvText"),
  parseTextBtn: document.getElementById("parseTextBtn"),
  stats: document.getElementById("stats"),
  filters: document.getElementById("filters"),
  tableWrap: document.getElementById("tableWrap"),
  decisionFilter: document.getElementById("decisionFilter"),
  minScoreFilter: document.getElementById("minScoreFilter"),
  reelsOnlyFilter: document.getElementById("reelsOnlyFilter"),
  downloadBtn: document.getElementById("downloadBtn"),
  copyTopBtn: document.getElementById("copyTopBtn")
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    cell += char;
    i += 1;
  }

  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

function toObjects(parsed) {
  if (!parsed.length) return [];
  const headers = parsed[0].map((h) => h.trim());
  return parsed.slice(1).map((line) => {
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = line[idx] ?? "";
    });
    return obj;
  });
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function lc(value) {
  return String(value || "").toLowerCase();
}

function classifyTheme(caption) {
  const text = lc(caption);
  if (/(психолог|отношен|тревог|эмоци|рефлекс|саморазвит|мотивац)/.test(text)) return "psychology";
  if (/(стил|гардероб|outfit|look|fashion|zara|mango|космет|макияж|волос)/.test(text)) return "beauty_style";
  if (/(трениров|фитнес|stretch|осанк|шпагат|похуд|здоров)/.test(text)) return "fitness_health";
  if (/(книг|подкаст|daily|привычк|продуктив|обуч|курс|чеклист)/.test(text)) return "education_productivity";
  if (/(дом|кухн|органайзер|интерьер|дизайн|ремонт|уборк)/.test(text)) return "home_life";
  if (/(ugc|блог|рилс|алгоритм|instagram|инст|маркетинг|контент)/.test(text)) return "creator_marketing";
  if (/(путешеств|travel|trip|barcelona|hotel|отпуск)/.test(text)) return "travel";
  return "other";
}

function classifyFormat(caption) {
  const text = lc(caption);
  if (/(чеклист|список|\b\d+\b|вопрос|иде[яй])/.test(text)) return "listicle";
  if (/(как |туториал|гайд|инструкц|ошибк|лайфхак)/.test(text)) return "howto";
  if (/(челлендж|challenge|вирус|viral|тренд)/.test(text)) return "challenge";
  if (/(мой |моя |история|кейс|опыт)/.test(text)) return "story";
  if (/(до|после|before|after)/.test(text)) return "before_after";
  if (/(обзор|review|подборк)/.test(text)) return "review";
  return "other";
}

function classifyHook(caption) {
  const text = lc(caption);
  if (/\?/.test(text)) return "question";
  if (/(срочно|никогда|всегда|обязательно|реально|шок)/.test(text)) return "bold_claim";
  if (/(ошибк|боль|проблем|не получ|не работает)/.test(text)) return "pain_point";
  if (/(секрет|почему|что если|неожидан|вдруг)/.test(text)) return "curiosity";
  if (/(сохрани|запомни|смотри|сделай|попробуй)/.test(text)) return "direct_instruction";
  return "other";
}

function classifyCta(caption) {
  const text = lc(caption);
  if (/(в директ|пиши|dm)/.test(text)) return "dm";
  if (/(подпис)/.test(text)) return "follow";
  if (/(сохрани|запомни)/.test(text)) return "save";
  if (/(коммент|комментар)/.test(text)) return "comment";
  if (/(ссылка|в шапке|link)/.test(text)) return "link";
  return "none";
}

function detectEvergreen(caption, formatType) {
  const text = lc(caption);
  if (formatType === "howto" || formatType === "listicle") return 1;
  if (/(инструкц|гайд|чеклист|список|привычк|вопрос)/.test(text)) return 1;
  return 0;
}

function estimateFit(theme) {
  // Neutral defaults; you can later add manual sliders.
  if (theme === "creator_marketing" || theme === "education_productivity") return 4;
  if (theme === "beauty_style" || theme === "psychology" || theme === "fitness_health") return 3;
  if (theme === "other") return 2;
  return 2.5;
}

function estimateEffort(formatType) {
  if (formatType === "howto" || formatType === "listicle") return "low";
  if (formatType === "story" || formatType === "review") return "mid";
  if (formatType === "challenge" || formatType === "before_after") return "high";
  return "mid";
}

function effortPenalty(effort) {
  if (effort === "high") return 1.2;
  if (effort === "mid") return 0.6;
  return 0;
}

function lnScore(v) {
  return Math.log((v ?? 0) + 1);
}

function daysSince(dateValue) {
  if (!dateValue) return null;
  const ts = new Date(dateValue).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function timeDecay(days, halfLifeDays = 45) {
  if (days === null) return 1;
  return Math.exp((-Math.log(2) * days) / halfLifeDays);
}

function scoreRow(row) {
  const views = numberOrNull(row.views_count) ?? 0;
  const likes = numberOrNull(row.likes_count) ?? 0;
  const comments = numberOrNull(row.comments_count) ?? 0;
  const ageDays = daysSince(row.published_at);
  const likeRate = views > 0 ? (likes / views) * 100 : 0;
  const commentRate = views > 0 ? (comments / views) * 100 : 0;

  const baseScore =
    lnScore(views) * 0.8 +
    lnScore(likes) * 1.1 +
    lnScore(comments) * 1.8 +
    lnScore(likeRate) * 1.0 +
    lnScore(commentRate) * 1.3;
  const freshnessFactor = timeDecay(ageDays, 45);
  const totalScore = Number((baseScore * freshnessFactor).toFixed(2));

  let decision = "archive";
  if (totalScore >= 7.5) decision = "shoot_now";
  else if (totalScore >= 4.5) decision = "adapt_later";

  return {
    ...row,
    like_rate_pct: Number(likeRate.toFixed(2)),
    comment_rate_pct: Number(commentRate.toFixed(2)),
    age_days: ageDays ?? "",
    freshness_factor: Number(freshnessFactor.toFixed(4)),
    total_score: totalScore,
    decision
  };
}

function sortRows(rows) {
  return [...rows].sort((a, b) => b.total_score - a.total_score);
}

function buildStats(rows) {
  const shootNow = rows.filter((r) => r.decision === "shoot_now").length;
  const adaptLater = rows.filter((r) => r.decision === "adapt_later").length;
  const archive = rows.filter((r) => r.decision === "archive").length;
  const avg = rows.reduce((acc, r) => acc + r.total_score, 0) / (rows.length || 1);

  const uniqueThemes = new Set(rows.map((r) => r.theme)).size;
  const avgEngagement =
    rows.reduce((acc, r) => acc + (numberOrNull(r.engagement_proxy) ?? 0), 0) / (rows.length || 1);
  const avgViews = rows.reduce((acc, r) => acc + (numberOrNull(r.views_count) ?? 0), 0) / (rows.length || 1);

  return {
    total: rows.length,
    shootNow,
    adaptLater,
    archive,
    avg: avg.toFixed(2),
    uniqueThemes,
    avgEngagement: Math.round(avgEngagement),
    avgViews: Math.round(avgViews)
  };
}

function renderStats(rows) {
  const stats = buildStats(rows);
  els.stats.classList.remove("hidden");
  els.stats.innerHTML = `
    <article class="stat"><div class="label">rows</div><div class="value">${stats.total}</div></article>
    <article class="stat"><div class="label">shoot_now</div><div class="value">${stats.shootNow}</div></article>
    <article class="stat"><div class="label">adapt_later</div><div class="value">${stats.adaptLater}</div></article>
    <article class="stat"><div class="label">archive</div><div class="value">${stats.archive}</div></article>
    <article class="stat"><div class="label">avg total_score</div><div class="value">${stats.avg}</div></article>
    <article class="stat"><div class="label">avg engagement</div><div class="value">${stats.avgEngagement}</div></article>
    <article class="stat"><div class="label">avg views</div><div class="value">${stats.avgViews}</div></article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isReel(row) {
  const type = String(row.item_type || "").toLowerCase();
  return type === "reel" || String(row.post_url || "").includes("/reel/");
}

function renderTable(rows) {
  els.tableWrap.classList.remove("hidden");
  const limited = rows.slice(0, 500);
  const htmlRows = limited
    .map((r) => {
      const link = r.post_url ? `<a href="${escapeHtml(r.post_url)}" target="_blank">open</a>` : "";
      return `
        <tr>
          <td><span class="pill ${r.decision}">${r.decision}</span></td>
          <td>${r.total_score}</td>
          <td>${escapeHtml(r.item_type || "")}</td>
          <td>${escapeHtml(r.age_days ?? "")}</td>
          <td>${escapeHtml(r.freshness_factor ?? "")}</td>
          <td>${escapeHtml(r.views_count)}</td>
          <td>${escapeHtml(r.likes_count)}</td>
          <td>${escapeHtml(r.comments_count)}</td>
          <td>${escapeHtml(r.like_rate_pct ?? "")}</td>
          <td>${escapeHtml(r.comment_rate_pct ?? "")}</td>
          <td>${link}</td>
          <td title="${escapeHtml(r.caption_text || "")}">${escapeHtml((r.caption_text || "").slice(0, 90))}</td>
        </tr>
      `;
    })
    .join("");

  els.tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>decision</th>
          <th>total_score</th>
          <th>type</th>
          <th>age_days</th>
          <th>freshness</th>
          <th>views</th>
          <th>likes</th>
          <th>comments</th>
          <th>like_rate_pct</th>
          <th>comment_rate_pct</th>
          <th>url</th>
          <th>caption (trim)</th>
        </tr>
      </thead>
      <tbody>${htmlRows}</tbody>
    </table>
  `;
}

function applyFilters() {
  const decision = els.decisionFilter.value;
  const minScore = numberOrNull(els.minScoreFilter.value) ?? 0;
  const reelsOnly = Boolean(els.reelsOnlyFilter.checked);

  state.filteredRows = state.scoredRows.filter((r) => {
    if (decision !== "all" && r.decision !== decision) return false;
    if (r.total_score < minScore) return false;
    if (reelsOnly && !isReel(r)) return false;
    return true;
  });

  renderStats(state.filteredRows);
  renderTable(state.filteredRows);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    if (text.includes('"') || text.includes(",") || text.includes("\n")) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  };
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => escapeCell(r[h])).join(",")).join("\n");
  return `\uFEFF${head}\n${body}\n`;
}

function downloadCsv(rows) {
  const csv = toCsv(rows);
  const url = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  const a = document.createElement("a");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `prioritized_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copyTopLinks(rows, topN = 20) {
  const text = rows
    .slice(0, topN)
    .map((r, i) => `${i + 1}. ${r.post_url}`)
    .join("\n");
  await navigator.clipboard.writeText(text);
}

async function processFile(file) {
  const text = await file.text();
  processCsvText(text);
}

function processCsvText(text) {
  const parsed = parseCsv(text);
  const objects = toObjects(parsed);
  if (!objects.length) {
    alert("CSV пустой или не распознан");
    return;
  }
  state.rawRows = objects;
  state.scoredRows = sortRows(objects.map(scoreRow));

  els.filters.classList.remove("hidden");
  els.downloadBtn.disabled = false;
  els.copyTopBtn.disabled = false;
  applyFilters();
}

async function processUrl(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить CSV (${res.status})`);
  }
  const text = await res.text();
  processCsvText(text);
}

function onDrop(ev) {
  ev.preventDefault();
  els.dropzone.classList.remove("dragover");
  const file = ev.dataTransfer?.files?.[0];
  if (file) processFile(file);
}

els.dropzone.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  els.dropzone.classList.add("dragover");
});

els.dropzone.addEventListener("dragleave", () => {
  els.dropzone.classList.remove("dragover");
});

els.dropzone.addEventListener("drop", onDrop);

els.fileInput.addEventListener("change", (ev) => {
  const file = ev.target.files?.[0];
  if (file) processFile(file);
});

els.loadUrlBtn.addEventListener("click", async () => {
  try {
    const url = (els.urlInput.value || "").trim();
    if (!url) return;
    await processUrl(url);
  } catch (error) {
    alert(error.message || "Ошибка загрузки по URL");
  }
});

els.parseTextBtn.addEventListener("click", () => {
  const text = els.csvText.value || "";
  processCsvText(text);
});

els.decisionFilter.addEventListener("change", applyFilters);
els.minScoreFilter.addEventListener("input", applyFilters);
els.reelsOnlyFilter.addEventListener("change", applyFilters);

els.downloadBtn.addEventListener("click", () => {
  downloadCsv(state.filteredRows.length ? state.filteredRows : state.scoredRows);
});

els.copyTopBtn.addEventListener("click", async () => {
  try {
    const rows = state.filteredRows.length ? state.filteredRows : state.scoredRows;
    await copyTopLinks(rows, 20);
    els.copyTopBtn.textContent = "Скопировано";
    setTimeout(() => {
      els.copyTopBtn.textContent = "Скопировать топ-20 ссылок";
    }, 1200);
  } catch {
    els.copyTopBtn.textContent = "Clipboard blocked";
  }
});
