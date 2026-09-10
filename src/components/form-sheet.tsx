"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Sheet } from "./ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
const DraftContext = createContext({ change: () => {}, cancel: () => {} });
export const useFormSheet = () => useContext(DraftContext);
export function FormSheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false),
    [confirm, setConfirm] = useState(false);
  const saving = useIsMutating() > 0;
  useEffect(() => {
    if (!open) {
      setDirty(false);
      setConfirm(false);
    }
  }, [open]);
  useEffect(() => {
    if (!open || !dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [open, dirty]);
  const changeOpen = (next: boolean) => {
    if (!next && saving) return;
    if (!next && dirty) {
      setConfirm(true);
      return;
    }
    onOpenChange(next);
  };
  return (
    <DraftContext.Provider
      value={{ change: () => setDirty(true), cancel: () => changeOpen(false) }}
    >
      <Sheet open={open} onOpenChange={changeOpen}>
        <div onChangeCapture={() => setDirty(true)}>{children}</div>
      </Sheet>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Puedes seguir editando o cerrar y descartar los datos de este
              formulario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDirty(false);
                setConfirm(false);
                onOpenChange(false);
              }}
            >
              Descartar cambios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DraftContext.Provider>
  );
}
