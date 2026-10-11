export function cleanText(text) {
  return text
    // Stage directions must not become spoken words or artificial long pauses.
    .replace(/(?:\*+|\(|\[)\s*(?:short |long )?(?:pause|pauses|breath|sigh)\s*(?:\*+|\)|\])/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#`]/g, '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\.{2,}/g, ',')
    .replace(/[^\p{L}\p{N}\s.,!?;:'"-]/gu, '')
    .replace(/\s+/g, ' ').trim();
}
