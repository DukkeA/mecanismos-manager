"use client";
import { useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  ImagePlus,
  Link,
  Unlink,
  Undo,
  Redo,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  plainNoteDocument,
  safeNoteLink,
  type NoteNode,
} from "@/domain/note-content";

async function imageData(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Selecciona una imagen PNG, JPEG o WebP de hasta 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.75);
    if (result.length > 600_000)
      throw new Error("La imagen es muy pesada. Usa una versión más pequeña.");
    return result;
  } finally {
    bitmap.close();
  }
}

export function NoteEditor({
  content,
  text,
  onChange,
  onBusy,
}: {
  content?: NoteNode | null;
  text: string;
  onChange: (doc: NoteNode) => void;
  onBusy: (value: boolean) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false),
    [href, setHref] = useState("");
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        link: {
          openOnClick: false,
          protocols: ["http", "https", "mailto", "tel"],
          isAllowedUri: safeNoteLink,
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { "data-type": "taskItem" },
        a11y: {
          checkboxLabel: (node) => `Completar: ${node.textContent || "tarea"}`,
        },
      }),
      Image.configure({ allowBase64: true }),
      Highlight,
    ],
    content: content ?? plainNoteDocument(text),
    editorProps: {
      attributes: {
        id: "entry-body",
        role: "textbox",
        "aria-label": "Contenido de la nota",
        "aria-multiline": "true",
        class: "note-prose note-editable",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON() as NoteNode),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold"),
      italic: editor?.isActive("italic"),
      underline: editor?.isActive("underline"),
      strike: editor?.isActive("strike"),
      highlight: editor?.isActive("highlight"),
      h2: editor?.isActive("heading", { level: 2 }),
      h3: editor?.isActive("heading", { level: 3 }),
      bullet: editor?.isActive("bulletList"),
      ordered: editor?.isActive("orderedList"),
      task: editor?.isActive("taskList"),
      quote: editor?.isActive("blockquote"),
    }),
  });
  if (!editor)
    return (
      <div
        className="min-h-64 rounded-lg border bg-card"
        aria-label="Cargando editor"
      />
    );
  const commands = [
    {
      key: "bold",
      label: "Negrita",
      icon: Bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: "Cursiva",
      icon: Italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: "underline",
      label: "Subrayado",
      icon: Underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      key: "strike",
      label: "Tachado",
      icon: Strikethrough,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: "highlight",
      label: "Resaltar",
      icon: Highlighter,
      run: () => editor.chain().focus().toggleHighlight().run(),
    },
    {
      key: "h2",
      label: "Título",
      icon: Heading2,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: "h3",
      label: "Subtítulo",
      icon: Heading3,
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      key: "bullet",
      label: "Lista con viñetas",
      icon: List,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: "ordered",
      label: "Lista numerada",
      icon: ListOrdered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "task",
      label: "Lista de tareas",
      icon: ListChecks,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      key: "quote",
      label: "Cita",
      icon: Quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];
  return (
    <div className="note-editor rounded-lg border bg-card">
      <div
        className="flex flex-wrap items-center gap-1 border-b p-2"
        aria-label="Formato de la nota"
      >
        <ToggleGroup
          type="multiple"
          size="sm"
          className="flex-wrap"
          value={Object.entries(state ?? {})
            .filter(([, on]) => on)
            .map(([key]) => key)}
        >
          {commands.map(({ key, label, icon: Icon, run }) => (
            <ToggleGroupItem
              key={key}
              value={key}
              title={label}
              aria-label={label}
              onClick={run}
            >
              <Icon />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Popover
          open={linkOpen}
          onOpenChange={(open) => {
            setLinkOpen(open);
            if (open) setHref(editor.getAttributes("link").href ?? "");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Añadir enlace"
              aria-label="Añadir enlace"
            >
              <Link />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="flex flex-col gap-3" align="start">
            <Field>
              <FieldLabel htmlFor="note-link">Dirección del enlace</FieldLabel>
              <Input
                id="note-link"
                value={href}
                onChange={(e) => setHref(e.target.value)}
                placeholder="https://…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
              />
            </Field>
            <Button
              type="button"
              disabled={!safeNoteLink(href)}
              onClick={() => {
                if (editor.state.selection.empty && !editor.isActive("link"))
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: "text",
                      text: href,
                      marks: [{ type: "link", attrs: { href } }],
                    })
                    .run();
                else
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .setLink({ href })
                    .run();
                setLinkOpen(false);
              }}
            >
              Aplicar enlace
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .unsetLink()
                  .run();
                setLinkOpen(false);
              }}
            >
              <Unlink data-icon="inline-start" />
              Quitar enlace
            </Button>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={reading}
          title="Insertar imagen"
          aria-label="Insertar imagen"
          onClick={() => file.current?.click()}
        >
          <ImagePlus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Deshacer"
          aria-label="Deshacer"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Rehacer"
          aria-label="Rehacer"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo />
        </Button>
        <input
          ref={file}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label="Archivo de imagen"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const image = e.target.files?.[0];
            e.target.value = "";
            if (!image) return;
            let count = 0;
            editor.state.doc.descendants((node) => {
              if (node.type.name === "image") count++;
            });
            if (count >= 5) {
              toast.error("Cada nota admite hasta cinco imágenes.");
              return;
            }
            setReading(true);
            onBusy(true);
            try {
              editor
                .chain()
                .focus()
                .setImage({ src: await imageData(image), alt: image.name })
                .run();
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "No se pudo leer la imagen.",
              );
            } finally {
              setReading(false);
              onBusy(false);
            }
          }}
        />
      </div>
      <EditorContent editor={editor} />
      <p
        className="border-t px-3 py-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {reading
          ? "Preparando imagen…"
          : "Hasta 5 imágenes · Las casillas se marcan al editar la nota."}
      </p>
    </div>
  );
}
