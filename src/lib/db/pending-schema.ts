/**
 * Database types for migrations that are written but not yet applied to the live database (D-135).
 *
 * `src/integrations/supabase/types.ts` is regenerated from the live database (`gen-types.yml`), so
 * anything added by an unapplied migration disappears from it. Code that uses those tables or
 * functions imports `db` from here instead of the plain client. Its type is the generated
 * schema plus the definitions below; at runtime it is the same Supabase client.
 *
 * When a migration is applied, delete its section here (the generated types take over).
 * Pending: 0006_chapter_board.sql (chapters on OpenBoardApp), 0007_slug_available.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Generated = Database["charter"];

// Add types for a migration here while it isn't applied yet; delete them once applied.
export type PendingEnums = Record<never, never>;
export type PendingTables = Record<never, never>;
export type PendingFunctions = {
  // 0006_chapter_board.sql
  chapter_board_status: {
    Args: { p_unit: string };
    Returns: {
      policy: string;
      request_id: string | null;
      status: string | null;
      board_org_id: string | null;
      note: string | null;
      can_request: boolean;
    }[];
  };
  chapter_board_requests_for: {
    Args: { p_org: string };
    Returns: {
      id: string;
      unit_id: string;
      chapter: string;
      status: string;
      requested_by_name: string | null;
      requested_at: string;
      decided_at: string | null;
      note: string | null;
      board_org_id: string | null;
    }[];
  };
  request_chapter_board: { Args: { p_unit: string }; Returns: string };
  decide_chapter_board: {
    Args: { p_request: string; p_approve: boolean; p_note?: string | null };
    Returns: undefined;
  };
  cancel_chapter_board_request: { Args: { p_request: string }; Returns: undefined };
  chapter_board_policy: { Args: { p_unit: string }; Returns: string };
  // 0007_slug_available.sql
  slug_available: { Args: { p_slug: string }; Returns: boolean };
};

export type FullDatabase = Omit<Database, "charter"> & {
  charter: {
    Tables: Omit<Generated["Tables"], keyof PendingTables> & PendingTables;
    Views: Generated["Views"];
    Functions: Omit<Generated["Functions"], keyof PendingFunctions> & PendingFunctions;
    Enums: Omit<Generated["Enums"], keyof PendingEnums> & PendingEnums;
    CompositeTypes: Generated["CompositeTypes"];
  };
};

/** The Supabase client, typed with pending migrations included. */
export const db = supabase as unknown as SupabaseClient<FullDatabase, "charter">;
