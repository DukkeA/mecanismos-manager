// Keep this comparison in sync with workshop.catalog_label_key and its parity tests.
// Lookalikes are folded only for catalog labels, never for IDs or part references.
const lookalikes = {
  a: "аΑαА",
  b: "ВΒ",
  c: "сСϹϲ",
  e: "еЕΕεϵ",
  h: "НΗ",
  i: "іІΙιӀı",
  j: "јЈ",
  k: "КκΚк",
  m: "МΜ",
  n: "Ν",
  o: "оОΟο",
  p: "рРΡρ",
  s: "ѕЅ",
  t: "ТΤτ",
  x: "хХΧχ",
  y: "уУΥυ",
} as const;
const equivalents = new Map(
  Object.entries(lookalikes).flatMap(([latin, chars]) =>
    [...chars].map((char) => [char, latin] as const),
  ),
);

export function cleanCatalogLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(
      /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff\u{e0100}-\u{e01ef}]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function catalogLabelKey(value: string) {
  const folded = [...cleanCatalogLabel(value).normalize("NFKD")]
    .map((char) => equivalents.get(char) ?? char)
    .join("")
    .toLowerCase()
    .replace(
      /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g,
      "",
    );
  // Spaces and punctuation separate words. Distinct letters and numbers remain distinct.
  return folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function catalogLabelError(value: string) {
  const name = cleanCatalogLabel(value),
    key = catalogLabelKey(name);
  if (name.length < 2 || name.length > 100)
    return "Usa entre 2 y 100 caracteres.";
  if (!/[a-z]/.test(key) || !/^[a-z0-9 ]+$/.test(key))
    return "Usa letras del alfabeto latino y números.";
  return null;
}
