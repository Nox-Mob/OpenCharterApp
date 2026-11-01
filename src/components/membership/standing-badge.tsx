import { Badge } from "@/components/ui/badge";
import { STANDING_LABELS, type Standing } from "@/modules/membership/standing";

const VARIANT: Record<Standing, "default" | "secondary" | "outline" | "destructive"> = {
  good: "default",
  grace: "secondary",
  lapsed: "destructive",
  pending: "outline",
  cancelled: "secondary",
  declined: "secondary",
  none: "outline",
};

export function StandingBadge({ standing }: { standing: Standing }) {
  return <Badge variant={VARIANT[standing]}>{STANDING_LABELS[standing]}</Badge>;
}
