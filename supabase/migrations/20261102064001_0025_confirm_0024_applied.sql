-- Marker migration: triggers application of pending 0024_board_scope_and_overview.
-- 0024 adds the 'self_and_chapters' seat scope, set_seat_scope, and org_overview_stats.
COMMENT ON TABLE public.seat_templates IS 'Board seat definitions; scoped to self, chapters, or both (0024).';