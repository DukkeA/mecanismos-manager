import type { ReactNode } from "react";
import {
  noteImageUrl,
  safeNoteLink,
  type NoteNode,
} from "@/domain/note-content";
import { Checkbox } from "@/components/ui/checkbox";
export function NotePreview({
  content,
  text,
}: {
  content?: NoteNode | null;
  text: string;
}) {
  function render(node: NoteNode, key: number): ReactNode {
    const children = node.content?.map(render);
    if (node.type === "text") {
      let text: ReactNode = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") text = <strong>{text}</strong>;
        if (mark.type === "italic") text = <em>{text}</em>;
        if (mark.type === "underline") text = <u>{text}</u>;
        if (mark.type === "strike") text = <s>{text}</s>;
        if (mark.type === "code") text = <code>{text}</code>;
        if (mark.type === "highlight") text = <mark>{text}</mark>;
        if (mark.type === "link" && safeNoteLink(mark.attrs?.href ?? ""))
          text = (
            <a
              href={mark.attrs!.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {text}
            </a>
          );
      }
      return <span key={key}>{text}</span>;
    }
    switch (node.type) {
      case "doc":
        return <div key={key}>{children}</div>;
      case "heading":
        return node.attrs?.level === 3 ? (
          <h3 key={key}>{children}</h3>
        ) : (
          <h2 key={key}>{children}</h2>
        );
      case "paragraph":
        return <p key={key}>{children}</p>;
      case "bulletList":
        return <ul key={key}>{children}</ul>;
      case "orderedList":
        return <ol key={key}>{children}</ol>;
      case "listItem":
        return <li key={key}>{children}</li>;
      case "taskList":
        return (
          <ul key={key} data-type="taskList">
            {children}
          </ul>
        );
      case "taskItem":
        return (
          <li key={key} data-type="taskItem">
            <Checkbox
              checked={!!node.attrs?.checked}
              disabled
              aria-label={node.attrs?.checked ? "Completado" : "Pendiente"}
            />
            <div>{children}</div>
          </li>
        );
      case "blockquote":
        return <blockquote key={key}>{children}</blockquote>;
      case "hardBreak":
        return <br key={key} />;
      case "horizontalRule":
        return <hr key={key} />;
      case "image": {
        const src = String(node.attrs?.src ?? "");
        return noteImageUrl.test(src) || src.startsWith("data:image/") ? (
          <img
            key={key}
            src={src}
            alt={String(node.attrs?.alt ?? "Imagen de nota")}
            loading="lazy"
          />
        ) : null;
      }
      default:
        return null;
    }
  }
  return (
    <div className="note-prose max-h-64 overflow-auto text-sm">
      {content ? (
        render(content, 0)
      ) : (
        <p className="whitespace-pre-wrap">
          {text || "Sin contenido adicional."}
        </p>
      )}
    </div>
  );
}
