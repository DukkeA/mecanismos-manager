"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
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
const DraftContext = createContext({
  change: () => {},
  cancel: () => {},
  saved: () => {},
  proceed: (action: () => void) => action(),
});
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
  const pendingAction = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open) {
      setDirty(false);
      setConfirm(false);
      pendingAction.current = null;
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
  const proceed = (action: () => void) => {
    if (saving) return;
    if (dirty) {
      pendingAction.current = action;
      setConfirm(true);
      return;
    }
    action();
  };
  const changeOpen = (next: boolean) => {
    if (next) onOpenChange(true);
    else proceed(() => onOpenChange(false));
  };
  return (
    <DraftContext.Provider
      value={{
        change: () => setDirty(true),
        cancel: () => changeOpen(false),
        saved: () => setDirty(false),
        proceed,
      }}
    >
      <Sheet open={open} onOpenChange={changeOpen}>
        <div onChangeCapture={() => setDirty(true)}>{children}</div>
      </Sheet>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Puedes seguir editando o continuar y descartar los datos de este
              formulario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDirty(false);
                setConfirm(false);
                const action = pendingAction.current;
                pendingAction.current = null;
                action?.();
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
