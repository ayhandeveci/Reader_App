const KEY_STORAGE = "openai_api_key_session";

const apiKeyEl = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");
const clearKeyBtn = document.getElementById("clearKey");
const keyStatusEl = document.getElementById("keyStatus");

const imageInput = document.getElementById("imageInput");
const previewWrap = document.getElementById("previewWrap");
const preview = document.getElementById("preview");

const userMsg = document.getElementById("userMsg");
const modeSel = document.getElementById("mode");
const askBtn = document.getElementById("ask");
const out = document.getElementById("out");

let imageDataUrl = null;

function setStatus(msg) { keyStatusEl.textContent = msg; }
function getKey() { return sessionStorage.getItem(KEY_STORAGE) || ""; }

function loadKeyStatus() {
  const k = getKey();
  if (k) setStatus("Key hazır (sessionStorage).");
  else setStatus("Key yok. Üstten girip Kaydet.");
}
loadKeyStatus();

saveKeyBtn.addEventListener("click", () => {
  const k = (apiKeyEl.value || "").trim();
  if (!k) return setStatus("Boş key olmaz.");
  sessionStorage.setItem(KEY_STORAGE, k);
  apiKeyEl.value = "";
  loadKeyStatus();
});

clearKeyBtn.addEventListener("click", () => {
  sessionStorage.removeItem(KEY_STORAGE);
  loadKeyStatus();
});

imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    out.textContent = "Lütfen bir görsel seç.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl = reader.result; // data:image/...;base64,...
    preview.src = imageDataUrl;
    previewWrap.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

function buildSystemPrompt(mode) {
  if (mode === "exam") {
    return `Sen bir sınav çalışma asistanısın.
Sadece kullanıcının gönderdiği ekran görüntüsündeki metin/şekil ve kullanıcının mesajına dayan.
Uydurma yapma. Görselde net değilse "görselde okunmuyor" de.
Çıktı:
1) Kısa açıklama
2) Kritik noktalar (madde madde)
3) 2 adet sınav tarzı soru + kısa cevap anahtarı`;
  }
  if (mode === "flashcards") {
    return `Sen bir flashcard üreticisisin.
Sadece ekran görüntüsündeki içerik + kullanıcı mesajı.
Uydurma yapma.
5-10 adet flashcard üret:
- Ön yüz: soru/terim
- Arka yüz: kısa cevap/açıklama`;
  }
  return `Sen bir ders çalışma asistanısın.
Sadece kullanıcının gönderdiği ekran görüntüsündeki içerik + kullanıcı mesajı.
Uydurma yapma. Görselde net değilse "görselde okunmuyor" de.
Çıktı:
- 6-10 maddelik çalışma notu
- 1 mini kontrol sorusu (cevapsız)`;
}

async function callOpenAI({ apiKey, prompt, imageDataUrl }) {
  // Responses API: supports text + image inputs :contentReference[oaicite:4]{index=4}
  const body = {
    model: "gpt-4.1-mini", // istersen sonra değiştiririz
    input: [
      {
        role: "system",
        content: [{ type: "text", text: prompt }]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: userMsg.value.trim() },
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
  // Responses API output format varies by content blocks; handle common cases.
  // We'll try: resp.output_text (if exists) else iterate outputs.
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

askBtn.addEventListener("click", async () => {
  out.textContent = "";
  const apiKey = getKey();
  if (!apiKey) { out.textContent = "Önce key girip Kaydet."; return; }
  if (!imageDataUrl) { out.textContent = "Önce screenshot seç."; return; }
  if (!userMsg.value.trim()) { out.textContent = "Mesajını yaz."; return; }

  askBtn.disabled = true;
  askBtn.textContent = "Gönderiliyor...";

  try {
    const sysPrompt = buildSystemPrompt(modeSel.value);
    const resp = await callOpenAI({ apiKey, prompt: sysPrompt, imageDataUrl });
    out.textContent = extractTextFromResponses(resp).trim();
  } catch (e) {
    out.textContent = `Hata: ${e.message}`;
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Gönder";
  }
});
