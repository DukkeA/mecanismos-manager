"use client";
import { DataEmpty } from "@/components/data-empty";
import { SearchX } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronsUpDown, LoaderCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFormSheet } from "@/components/form-sheet";
import { useWorkshopScope } from "@/features/workshop/query";
import {
  catalogLabelError,
  catalogLabelKey,
  cleanCatalogLabel,
} from "@/domain/catalog-label";
import { useCategories, useCategoryCommand } from "./hooks";

type Props = {
  id?: string;
  name?: string;
  label?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

export function CategoryPicker({
  id,
  name,
  label = "Categoría",
  value,
  onChange,
  multiple = false,
  disabled,
  invalid,
  describedBy,
}: Props) {
  const query = useCategories(),
    command = useCategoryCommand(),
    draft = useFormSheet();
  const { demo } = useWorkshopScope();
  const errorId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null),
    inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const requests = useRef(new Map<string, string>());
  const categories = query.data ?? [];
  const selected = categories.filter((c) => value.includes(c.id));
  const key = catalogLabelKey(search),
    nameError = catalogLabelError(search);
  const exact = categories.find((c) => catalogLabelKey(c.name) === key);
  const visible = categories.filter(
    (c) =>
      (c.active || value.includes(c.id) || c === exact) &&
      catalogLabelKey(c.name).includes(key),
  );
  const canCreate =
    !demo && !query.isFetching && !query.isError && !exact && !nameError;
  const busy = disabled || command.isPending;
  useEffect(() => {
    if (restoreFocus.current && !open && !command.isPending) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
    if (command.isError && open) inputRef.current?.focus();
  }, [open, command.isPending, command.isError]);

  const select = (ids: string[]) => {
    draft.change();
    onChange(ids);
  };
  const choose = (categoryId: string) => {
    if (busy) return;
    select(
      multiple
        ? value.includes(categoryId)
          ? value.filter((v) => v !== categoryId)
          : [...value, categoryId]
        : [categoryId],
    );
    if (!multiple) setOpen(false);
  };
  const create = async () => {
    if (!canCreate || busy) return;
    const displayName = cleanCatalogLabel(search);
    const requestId = requests.current.get(displayName) ?? crypto.randomUUID();
    requests.current.set(displayName, requestId);
    try {
      const category = await command.mutateAsync({
        kind: "create",
        input: { requestId, name: cleanCatalogLabel(search) },
      });
      select(multiple ? [...new Set([...value, category.id])] : [category.id]);
      setSearch("");
      restoreFocus.current = true;
      setOpen(false);
      toast.success(
        category.created
          ? `Categoría «${category.name}» creada.`
          : `Se seleccionó «${category.name}», que ya existía.`,
      );
    } catch {
      /* The error stays beside the search, with the draft intact. */
    }
  };

  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-2"
      onKeyDown={(event) => {
        if (open && event.key === "Enter") event.preventDefault();
      }}
    >
      {name &&
        (value.length ? value : multiple ? [] : [""]).map((v) => (
          <input key={v} type="hidden" name={name} value={v} />
        ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (command.isPending) return;
          setOpen(next);
          if (next) {
            setSearch("");
            command.reset();
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            ref={triggerRef}
            type="button"
            variant="input"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            disabled={busy}
            className="w-full min-w-0 justify-between gap-2"
          >
            <span className="truncate">
              {multiple && selected.length
                ? `${selected.length} ${selected.length === 1 ? "categoría seleccionada" : "categorías seleccionadas"}`
                : (selected[0]?.name ??
                  (query.isPending && !demo
                    ? "Cargando categorías…"
                    : "Seleccionar categoría"))}
            </span>
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-0 p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar o crear categoría…"
              aria-label="Buscar categoría"
              ref={inputRef}
              aria-describedby={command.error ? errorId : undefined}
              value={search}
              maxLength={100}
              disabled={command.isPending}
              onValueChange={(text) => {
                setSearch(text);
                if (command.error) command.reset();
              }}
            />
            <CommandList label="Categorías">
              <CommandEmpty>
                {query.isFetching ? (
                  <span role="status">Cargando categorías…</span>
                ) : query.isError ? null : (
                  <DataEmpty
                    compact
                    icon={SearchX}
                    title="Sin categorías con ese nombre"
                    description={
                      demo
                        ? "Las categorías se guardan en el entorno local."
                        : "Prueba con otro nombre."
                    }
                  />
                )}
              </CommandEmpty>
              <CommandGroup>
                {visible.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.id}
                    data-checked={value.includes(c.id)}
                    disabled={busy || (!c.active && !value.includes(c.id))}
                    onSelect={() => choose(c.id)}
                    className="min-h-[var(--control-height)] cursor-pointer"
                  >
                    <span className="min-w-0 break-words">
                      {c.name}
                      {!c.active && (
                        <span className="text-muted-foreground">
                          {" "}
                          · Inactiva
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {canCreate && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="create-category"
                      onSelect={create}
                      disabled={busy}
                      className="min-h-[var(--control-height)] cursor-pointer text-primary"
                    >
                      {command.isPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Plus />
                      )}
                      <span className="min-w-0 break-words">
                        {command.isPending
                          ? "Creando…"
                          : `Crear «${cleanCatalogLabel(search)}»`}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {exact && !exact.active && !value.includes(exact.id) && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Ya existe y está desactivada. Administración puede reactivarla
                en Configuración.
              </p>
            )}
            {search && !exact && nameError && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {nameError}
              </p>
            )}
            {command.error && (
              <p
                id={errorId}
                role="alert"
                className="px-3 py-2 text-sm text-destructive"
              >
                {command.error.message}
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 && (
        <ul
          aria-label="Categorías seleccionadas"
          className="flex flex-wrap gap-2"
        >
          {selected.map((c) => (
            <li key={c.id}>
              <Badge
                variant="secondary"
                className="min-h-8 max-w-full gap-1 py-0 pr-0"
              >
                <span className="whitespace-normal break-words">
                  {c.name}
                  {!c.active ? " · Inactiva" : ""}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${c.name}`}
                  disabled={busy}
                  onClick={() => select(value.filter((v) => v !== c.id))}
                >
                  <X />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {query.error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm text-destructive"
        >
          {query.error.message}
          <Button type="button" variant="link" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
  );
}

export function CategoryFormControl({
  defaultValue,
  ...props
}: Omit<Props, "value" | "onChange"> & { defaultValue?: unknown }) {
  const [value, setValue] = useState<string[]>(() =>
    Array.isArray(defaultValue)
      ? (defaultValue as string[])
      : typeof defaultValue === "string" && defaultValue
        ? [defaultValue]
        : [],
  );
  return <CategoryPicker {...props} value={value} onChange={setValue} />;
}
