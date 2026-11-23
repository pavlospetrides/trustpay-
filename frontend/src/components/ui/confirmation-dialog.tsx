"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function ConfirmationDialog({ open, onOpenChange, title, children, confirmLabel, onConfirm, busy }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy: boolean;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop"/>
      <Dialog.Content className="confirm-dialog crystal-dialog">
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description asChild><div className="dialog-description">{children}</div></Dialog.Description>
        <Dialog.Close className="dialog-close" aria-label="Close dialog"><X size={18}/></Dialog.Close>
        <div className="dialog-actions"><Dialog.Close className="button secondary">Cancel</Dialog.Close><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
