"use client";
import { useI18n } from "@/lib/i18n/provider";
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
  const { t } = useI18n();

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop"/>
      <Dialog.Content className="confirm-dialog crystal-dialog">
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description asChild><div className="dialog-description">{children}</div></Dialog.Description>
        <Dialog.Close className="dialog-close" aria-label={t("close-dialog")}><X size={18}/></Dialog.Close>
        <div className="dialog-actions"><Dialog.Close className="button secondary">{t("cancel")}</Dialog.Close><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy ? t("working") : confirmLabel}</button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
