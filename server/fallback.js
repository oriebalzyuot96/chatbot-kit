// Local keyword matcher over knowledge/profile.json. Used when no API key is
// configured or the upstream call fails, so the widget keeps working offline.

function normalize(s) {
  return ` ${String(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics, tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')} `;
}

export function fallbackAnswer(profile, question, lang) {
  const l = lang === 'ar' ? 'ar' : 'en';
  const text = normalize(question);
  let best = null;
  let bestScore = 0;
  for (const entry of profile.faq ?? []) {
    let score = 0;
    for (const kw of entry.keywords ?? []) {
      const k = normalize(kw);
      // A trailing space in the keyword (e.g. "hi ") means whole-word match.
      const needle = kw.endsWith(' ') ? k : k.trim();
      if (text.includes(needle)) score += 1 + k.trim().length / 100;
    }
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best ? best[l] : profile.unknown[l];
}

export function* chunkText(text) {
  const parts = text.match(/\S+\s*/g) ?? [text];
  let buf = '';
  for (const p of parts) {
    buf += p;
    if (buf.length >= 12) {
      yield buf;
      buf = '';
    }
  }
  if (buf) yield buf;
}
