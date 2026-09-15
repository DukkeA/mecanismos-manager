import { DomainError } from "./errors";

export type NoteNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | boolean>;
  marks?: { type: string; attrs?: Record<string, string> }[];
  content?: NoteNode[];
};
export const noteImageUrl = /^\/api\/organizer\/images\?id=([0-9a-f-]{36})$/i;
export const inlineNoteImage =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export function safeNoteLink(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}
const nodeTypes = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "image",
  "horizontalRule",
]);
const markTypes = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "link",
]);

// Keep a small, explicit document schema. Never accept arbitrary HTML or attributes.
export function normalizeNoteContent(raw: unknown): NoteNode | null {
  if (raw == null) return null;
  let nodes = 0,
    images = 0,
    imageBytes = 0;
  function visit(value: unknown, depth: number): NoteNode {
    if (!value || typeof value !== "object" || depth > 12 || ++nodes > 2000)
      throw new DomainError("La nota es demasiado extensa.");
    const v = value as Record<string, unknown>;
    if (typeof v.type !== "string" || !nodeTypes.has(v.type))
      throw new DomainError("La nota contiene un formato no admitido.");
    const result: NoteNode = { type: v.type };
    const attrs = (v.attrs ?? {}) as Record<string, unknown>;
    if (v.type === "text") {
      if (typeof v.text !== "string")
        throw new DomainError("Texto de nota inválido.");
      result.text = v.text;
    }
    if (v.type === "heading")
      result.attrs = { level: attrs.level === 3 ? 3 : 2 };
    if (v.type === "taskItem")
      result.attrs = { checked: attrs.checked === true };
    if (v.type === "orderedList") result.attrs = { start: 1 };
    if (v.type === "image") {
      const src = String(attrs.src ?? "");
      if (
        ++images > 5 ||
        (!noteImageUrl.test(src) && !inlineNoteImage.test(src))
      )
        throw new DomainError(
          "Usa hasta cinco imágenes PNG, JPEG o WebP por nota.",
        );
      if (src.startsWith("data:")) imageBytes += src.length;
      if (src.length > 600_000 || imageBytes > 2_500_000)
        throw new DomainError(
          "Las imágenes de la nota superan el tamaño permitido.",
        );
      result.attrs = {
        src,
        alt: String(attrs.alt ?? "Imagen de la nota").slice(0, 200),
      };
    }
    if (Array.isArray(v.marks))
      result.marks = v.marks.map((rawMark) => {
        const mark = rawMark as { type: string; attrs?: { href?: string } };
        if (!markTypes.has(mark.type))
          throw new DomainError("Formato de texto no admitido.");
        if (mark.type === "link") {
          const href = String(mark.attrs?.href ?? "");
          if (href.length > 2000 || !safeNoteLink(href))
            throw new DomainError(
              "Usa un enlace válido (https, correo o teléfono).",
            );
          return {
            type: "link",
            attrs: { href, target: "_blank", rel: "noopener noreferrer" },
          };
        }
        return { type: mark.type };
      });
    if (Array.isArray(v.content))
      result.content = v.content.map((child) => visit(child, depth + 1));
    return result;
  }
  const doc = visit(raw, 0);
  if (doc.type !== "doc")
    throw new DomainError("El contenido debe ser una nota.");
  if (notePlainText(doc).length > 10000)
    throw new DomainError("La nota admite hasta 10.000 caracteres.");
  return doc;
}
export function notePlainText(node: NoteNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "image") return String(node.attrs?.alt ?? "");
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? [])
    .map(notePlainText)
    .join(["paragraph", "heading"].includes(node.type) ? "" : "\n");
}
export function plainNoteDocument(text: string): NoteNode {
  return {
    type: "doc",
    content: text
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        ...(line ? { content: [{ type: "text", text: line }] } : {}),
      })),
  };
}
