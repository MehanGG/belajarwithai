// Model utama dulu; kalau error / quota habis, otomatis pakai model cadangan.
const MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];
const YT = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/|v\/))([\w-]{11})/;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.GeminiAPI;
  if (!key) return res.status(500).json({ error: "Environment variable GeminiAPI belum diatur di Vercel." });
  const { system, prompt, yt, json, images } = req.body || {};
  const parts = [];
  for (const im of (Array.isArray(images) ? images : []).slice(0, 8)) {
    if (/^image\/(jpeg|png|webp)$/.test(im?.mime) && typeof im.data === "string")
      parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
  }
  if (yt) {
    const m = String(yt).match(YT);
    if (!m) return res.status(400).json({ error: "Link YouTube tidak valid." });
    parts.push({ file_data: { file_uri: "https://www.youtube.com/watch?v=" + m[1] } });
  }
  parts.push({ text: prompt || "" });
  let err = "";
  for (const m of MODELS) {
    const body = {
      contents: [{ role: "user", parts }],
      systemInstruction: { parts: [{ text: system || "Kamu asisten belajar. Jawab dalam bahasa Indonesia yang jelas." }] },
    };
    const gc = {};
    if (json) gc.responseMimeType = "application/json";
    if (/2\.5/.test(m)) gc.thinkingConfig = { thinkingBudget: 0 }; // lebih cepat, hindari timeout
    if (Object.keys(gc).length) body.generationConfig = gc;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
        if (text) return res.json({ text, model: m });
        err = d.promptFeedback?.blockReason ? "Konten diblokir: " + d.promptFeedback.blockReason : "Respons kosong dari AI.";
        continue;
      }
      err = `[${m}] ` + (d.error?.message || r.statusText);
    } catch (e) {
      err = `[${m}] ` + e.message;
    }
  }
  res.status(502).json({ error: err });
};
