const KEY_STORAGE = "openai_api_key_session";
const NOTES_STORAGE = "notes_session";
const MISTAKES_STORAGE = "mistakes_session";

/* ------------------ Elements ------------------ */
const apiKeyEl = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");
const clearKeyBtn = document.getElementById("clearKey");
const keyStatusEl = document.getElementById("keyStatus");

const pdfInput = document.getElementById("pdfInput");
const pdfWrap = document.getElementById("pdfWrap");
const pdfCanvas = document.getElementById("pdfCanvas");
const pageInfo = document.getElementById("pageInfo");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const useThisPageBtn = document.getElementById("useThisPage");

const imageInput = document.getElementById("imageInput");
const previewWrap = document.getElementById("previewWrap");
const preview = document.getElementById("preview");

const userMsg = document.getElementById("userMsg");
const modeSel = document.getElementById("mode");
const askBtn = document.getElementById("ask");
const out = document.getElementById("out");
const toast = document.getElementById("toast");

// quick buttons
const btnExplain = document.getElementById("btnExplain");
const btnExam = document.getElementById("btnExam");
const btnFlash = document.getElementById("btnFlash");

// answer actions
const copyAnswerBtn = document.getElementById("copyAnswer");
const addToNotesBtn = document.getElementById("addToNotes");
const addToMistakesBtn = document.getElementById("addToMistakes");

// notes
const notesEl = document.getElementById("notes");
const copyNotesBtn = document.getElementById("copyNotes");
const clearNotesBtn = document.getElementById("clearNotes");

// mistakes
const mistakeInput = document.getElementById("mistakeInput");
const addMistakeBtn = document.getElementById("addMistake");
const mistakesEl = document.getElementById("mistakes");
const copyMistakesBtn = document.getElementById("copyMistakes");
const clearMistakesBtn = document.getElementById("clearMistakes");

/* ------------------ State ------------------ */
let imageDataUrl = null;      // the image we send to GPT
let imageSource = "none";     // "pdf" or "upload"

// pdf.js state
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let rendering = false;

/* ------------------ Helpers ------------------ */
function setStatus(msg) { keyStatusEl.textContent = msg; }
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 1400);
}
function getKey() { return sessionStorage.getItem(KEY_STORAGE) || ""; }

function loadKeyStatus() {
  const k = getKey();
  if (k) setStatus("Key hazır (sessionStorage).");
  else setStatus("Key yok. Üstten girip Kaydet.");
}
loadKeyStatus();

function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ------------------ Storage: Notes & Mistakes ------------------ */
function getNotes() { return sessionStorage.getItem(NOTES_STORAGE) || ""; }
function setNotes(v) { sessionStorage.setItem(NOTES_STORAGE, v); }
function refreshNotes() { notesEl.textContent = getNotes().trim(); }

function getMistakes() { return sessionStorage.getItem(MISTAKES_STORAGE) || ""; }
function setMistakes(v) { sessionStorage.setItem(MISTAKES_STORAGE, v); }
function refreshMistakes() { mistakesEl.textContent = getMistakes().trim(); }

refreshNotes();
refreshMistakes();

/* ------------------ Clipboard ------------------ */
async function copyText(txt) {
  if (!txt.trim()) { showToast("Boş"); return; }
  try {
    await navigator.clipboard.writeText(txt);
    showToast("Kopyalandı");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("Kopyalandı");
  }
}

/* ------------------ Key Buttons ------------------ */
saveKeyBtn.addEventListener("click", () => {
  const k = (apiKeyEl.value || "").trim();
  if (!k) return setStatus("Boş key olmaz.");
  sessionStorage.setItem(KEY_STORAGE, k);
  apiKeyEl.value = "";
  loadKeyStatus();
  showToast("Key kaydedildi");
});

clearKeyBtn.addEventListener("click", () => {
  sessionStorage.removeItem(KEY_STORAGE);
  loadKeyStatus();
  showToast("Key temizlendi");
});

/* ------------------ Manual Image Upload (optional) ------------------ */
imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    out.textContent = "Lütfen bir görsel seç.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl = reader.result;
    imageSource = "upload";
    preview.src = imageDataUrl;
    previewWrap.classList.remove("hidden");
    showToast("Screenshot yüklendi (manuel)");
  };
  reader.readAsDataURL(file);
});

/* ------------------ PDF.js Setup ------------------ */
// pdf.js worker
if (window.pdfjsLib?.GlobalWorkerOptions) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
}

async function loadPdfFromFile(file) {
  const ab = await file.arrayBuffer();
  pdfDoc = await window.pdfjsLib.getDocument({ data: ab }).promise;
  totalPages = pdfDoc.numPages;
  currentPage = 1;
  pageInfo.textContent = `Sayfa: ${currentPage} / ${totalPages}`;
  pdfWrap.classList.remove("hidden");
  await renderPage(currentPage);
  showToast("PDF yüklendi");
}

async function renderPage(pageNum) {
  if (!pdfDoc || rendering) return;
  rendering = true;

  const page = await pdfDoc.getPage(pageNum);

  // iPhone için ölçek: canvas genişliğine göre otomatik
  const viewport = page.getViewport({ scale: 1 });
  const containerWidth = Math.min(window.innerWidth - 40, 900); // padding/limit
  const scale = containerWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });

  const ctx = pdfCanvas.getContext("2d");
  pdfCanvas.width = Math.floor(scaledViewport.width);
  pdfCanvas.height = Math.floor(scaledViewport.height);

  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

  pageInfo.textContent = `Sayfa: ${currentPage} / ${totalPages}`;
  rendering = false;
}

pdfInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.type !== "application/pdf") {
    showToast("Lütfen PDF seç");
    return;
  }
  await loadPdfFromFile(file);

  // PDF yüklendikten sonra, default olarak "Bu sayfa" görsel kaynağı olsun
  imageDataUrl = pdfCanvas.toDataURL("image/png");
  imageSource = "pdf";
});

prevPageBtn.addEventListener("click", async () => {
  if (!pdfDoc || currentPage <= 1) return;
  currentPage -= 1;
  await renderPage(currentPage);
  // sayfa değişince otomatik güncelle
  imageDataUrl = pdfCanvas.toDataURL("image/png");
  imageSource = "pdf";
});

nextPageBtn.addEventListener("click", async () => {
  if (!pdfDoc || currentPage >= totalPages) return;
  currentPage += 1;
  await renderPage(currentPage);
  imageDataUrl = pdfCanvas.toDataURL("image/png");
  imageSource = "pdf";
});

useThisPageBtn.addEventListener("click", () => {
  if (!pdfDoc) return showToast("Önce PDF yükle");
  imageDataUrl = pdfCanvas.toDataURL("image/png");
  imageSource = "pdf";
  showToast(`Sayfa ${currentPage} seçildi`);
});

/* ------------------ Prompting ------------------ */
function buildSystemPrompt(mode) {
  const pageHint = (imageSource === "pdf" && pdfDoc)
    ? `Kullanıcı şu an PDF'in ${currentPage}. sayfasını gönderdi.`
    : `Kullanıcı bir ekran görüntüsü gönderdi.`;

  if (mode === "exam") {
    return `Sen bir sınav çalışma asistanısın.
${pageHint}
Sadece kullanıcının gönderdiği görseldeki metin/şekil ve kullanıcının mesajına dayan.
Uydurma yapma. Görselde net değilse "görselde okunmuyor" de.
Çıktı:
1) Kısa açıklama
2) Kritik noktalar (madde madde)
3) 2 adet sınav tarzı soru + kısa cevap anahtarı`;
  }

  if (mode === "flashcards") {
    return `Sen bir flashcard üreticisisin.
${pageHint}
Sadece görseldeki içerik + kullanıcı mesajı.
Uydurma yapma.
5-10 adet flashcard üret:
- Ön yüz: soru/terim
- Arka yüz: kısa cevap/açıklama`;
  }

  return `Sen bir ders çalışma asistanısın.
${pageHint}
Sadece görseldeki içerik + kullanıcı mesajı.
Uydurma yapma. Görselde net değilse "görselde okunmuyor" de.
Çıktı:
- 6-10 maddelik çalışma notu
- 1 mini kontrol sorusu (cevapsız)`;
}

async function callOpenAI({ apiKey, systemPrompt, imageDataUrl, userText }) {
  const body = {
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [{ type: "text", text: systemPrompt }]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: userText },
          { type: "input_image", image_url: imageDataUrl }
        ]
      }
    ]
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`HTTP ${res.status}: ${errTxt}`);
  }
  return res.json();
}

function extractTextFromResponses(resp) {
  if (resp.output_text) return resp.output_text;
  const outBlocks = resp.output || [];
  let acc = "";
  for (const item of outBlocks) {
    const content = item.content || [];
    for (const c of content) {
      if (c.type === "output_text" && c.text) acc += c.text;
      if (c.type === "text" && c.text) acc += c.text;
    }
  }
  return acc || JSON.stringify(resp, null, 2);
}

/* ------------------ Main Ask Flow ------------------ */
async function askWithMode(modeValue) {
  out.textContent = "";

  const apiKey = getKey();
  if (!apiKey) { out.textContent = "Önce key girip Kaydet."; return; }

  if (!imageDataUrl) { out.textContent = "Önce PDF yükle veya screenshot seç."; return; }

  const msg = userMsg.value.trim();
  if (!msg) { out.textContent = "Mesajını yaz."; return; }

  askBtn.disabled = true;
  askBtn.textContent = "Gönderiliyor...";

  try {
    const sysPrompt = buildSystemPrompt(modeValue);
    const resp = await callOpenAI({
      apiKey,
      systemPrompt: sysPrompt,
      imageDataUrl,
      userText: msg
    });
    out.textContent = extractTextFromResponses(resp).trim();
    showToast("Yanıt geldi");
  } catch (e) {
    out.textContent = `Hata: ${e.message}`;
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Gönder";
  }
}

askBtn.addEventListener("click", async () => askWithMode(modeSel.value));

// quick mode buttons
btnExplain.addEventListener("click", () => {
  modeSel.value = "study";
  askWithMode("study");
});
btnExam.addEventListener("click", () => {
  modeSel.value = "exam";
  askWithMode("exam");
});
btnFlash.addEventListener("click", () => {
  modeSel.value = "flashcards";
  askWithMode("flashcards");
});

/* ------------------ Answer Actions ------------------ */
copyAnswerBtn.addEventListener("click", () => copyText(out.textContent || ""));

addToNotesBtn.addEventListener("click", () => {
  const ans = (out.textContent || "").trim();
  if (!ans) return showToast("Yanıt yok");

  const msg = (userMsg.value || "").trim();
  const where = (imageSource === "pdf" && pdfDoc) ? `PDF sayfa ${currentPage}` : "Görsel";
  const block =
`[${nowStamp()}] NOT (${where})
Soru/İstek: ${msg || "(boş)"}
Yanıt:
${ans}

---\n`;
  setNotes(getNotes() + block);
  refreshNotes();
  showToast("Notlara eklendi");
});

addToMistakesBtn.addEventListener("click", () => {
  const ans = (out.textContent || "").trim();
  if (!ans) return showToast("Yanıt yok");

  const msg = (userMsg.value || "").trim();
  const where = (imageSource === "pdf" && pdfDoc) ? `PDF sayfa ${currentPage}` : "Görsel";
  const block =
`[${nowStamp()}] YANLIŞ / DERS (${where})
Ne sordum: ${msg || "(boş)"}
Not: Buraya kendi yanlış yorumunu yazıp yanıtı referans alabilirsin.
Yanıt (referans):
${ans}

---\n`;
  setMistakes(getMistakes() + block);
  refreshMistakes();
  showToast("Yanlışlara eklendi");
});

/* ------------------ Notes & Mistakes Buttons ------------------ */
copyNotesBtn.addEventListener("click", () => copyText(getNotes()));
clearNotesBtn.addEventListener("click", () => {
  setNotes("");
  refreshNotes();
  showToast("Notlar temizlendi");
});

addMistakeBtn.addEventListener("click", () => {
  const t = (mistakeInput.value || "").trim();
  if (!t) return showToast("Boş olmaz");
  const block = `[${nowStamp()}] ${t}\n`;
  setMistakes(getMistakes() + block);
  refreshMistakes();
  mistakeInput.value = "";
  showToast("Yanlış eklendi");
});

copyMistakesBtn.addEventListener("click", () => copyText(getMistakes()));
clearMistakesBtn.addEventListener("click", () => {
  setMistakes("");
  refreshMistakes();
  showToast("Yanlışlar temizlendi");
});
