import type { AttributeInput, AttributeSubject } from "@/engines/attributes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttributeForm } from "./attribute-form";

/**
 * Add/edit dialog for one attribute definition (E-09). The header and the
 * primary button stay pinned while the form body scrolls, so long choice
 * lists (for example a 20-step rank list) never push Save off-screen.
 */
export function AttributeFieldDialog({
  open,
  title,
  value,
  locked = false,
  onChange,
  onClose,
  primaryLabel,
  onPrimary,
  busy = false,
  subject = "member",
}: {
  open: boolean;
  title: string;
  value: AttributeInput | null;
  locked?: boolean;
  onChange: (v: AttributeInput) => void;
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  busy?: boolean;
  subject?: AttributeSubject;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 pb-4 pt-6">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div
          data-testid="attribute-field-scroll"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4"
        >
          {value && (
            <AttributeForm value={value} locked={locked} onChange={onChange} subject={subject} />
          )}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button onClick={onPrimary} disabled={busy}>
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
