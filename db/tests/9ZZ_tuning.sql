-- Pre-production tuning (core 0016): nothing left to tune in the charter schema.
begin;
do $$
declare n int;
begin
  select count(*) into n from public.tuning_problems('charter');
  if n > 0 then
    raise exception 'FAILED: % has % things to tune: %', 'charter', n,
      (select string_agg(kind || ' (' || object || ')', '; ') from public.tuning_problems('charter'));
  end if;
end $$;
rollback;
