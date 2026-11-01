import { supabase } from "@/integrations/supabase/client";
import { coerceInput, validateValue } from "@/engines/attributes";
import type { DefWithOptions } from "./queries";

/** First validation problem across the given fields, or null. Mirrors the database checks. */
export function firstValueError(
  defs: readonly DefWithOptions[],
  draft: Record<string, unknown>,
): string | null {
  for (const d of defs) {
    const err = validateValue(d, d.options, coerceInput(d.data_type, draft[d.id]));
    if (err) return err;
  }
  return null;
}

/** Writes changed values through set_attribute_value (D-112). Unchanged values are skipped. */
export async function saveAttributeValues(
  defs: readonly DefWithOptions[],
  entityId: string,
  draft: Record<string, unknown>,
  current: Record<string, unknown> = {},
) {
  for (const d of defs) {
    const next = coerceInput(d.data_type, draft[d.id]);
    if (JSON.stringify(next ?? null) === JSON.stringify(current[d.id] ?? null)) continue;
    const { error } = await supabase.rpc("set_attribute_value", {
      _def: d.id,
      _entity: entityId,
      _value: (next ?? null) as never,
    });
    if (error) throw error;
  }
}
