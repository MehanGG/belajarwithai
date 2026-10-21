// Model utama dulu; kalau quota habis / error, otomatis pakai model cadangan.
const MODELS = ["gemini-3.5-flash", "gemini-2.5-flash"];

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.GeminiAPI;
  if (!key) return res.status(500).json({ error: "Environment variable GeminiAPI belum diatur di Vercel." });
  const { system, prompt, yt, json } = req.body || {};
  const parts = [];
  if (yt) parts.push({ file_data: { file_uri: yt } });
  parts.push({ text: prompt || "" });
  const body = {
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: system || "Kamu asisten belajar. Jawab dalam bahasa Indonesia yang jelas." }] },
  };
  if (json) body.generationConfig = { responseMimeType: "application/json" };
  let err = "";
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      const text = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      return res.json({ text, model: m });
    }
    err = d.error?.message || r.statusText;
    if (![429, 404, 500, 503].includes(r.status) && !/quota/i.test(err)) break;
  }
  res.status(502).json({ error: err });
};
