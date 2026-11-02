import { Badge } from "@/components/ui/badge";

/** Marks test data everywhere it shows (D-148). */
export function DemoBadge() {
  return (
    <Badge
      variant="outline"
      className="border-dashed"
      title="Test data: can be deleted, never sends email"
    >
      Demo
    </Badge>
  );
}
