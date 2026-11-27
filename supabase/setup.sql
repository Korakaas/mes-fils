-- Appli crochet : à exécuter une seule fois dans Supabase (SQL Editor > New query > Run).
-- Les données sont rangées par « code secret » : seul qui connaît ton code (24 caractères) y accède.

create table if not exists public.crochet_docs (
  code text not null,
  coll text not null,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  primary key (code, coll, id)
);

create index if not exists crochet_docs_pull on public.crochet_docs (code, server_at);

-- Aucune règle d'accès directe : la table n'est joignable qu'à travers les deux fonctions ci-dessous.
alter table public.crochet_docs enable row level security;
revoke all on public.crochet_docs from anon, authenticated;

create or replace function public.crochet_push(p_code text, p_docs jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb;
begin
  if length(coalesce(p_code, '')) < 16 then
    raise exception 'code trop court';
  end if;
  if jsonb_typeof(p_docs) is distinct from 'array' or jsonb_array_length(p_docs) > 200 then
    raise exception 'envoi invalide';
  end if;
  for d in select * from jsonb_array_elements(p_docs) loop
    if length(coalesce(d->>'coll', '')) > 32 or length(coalesce(d->>'id', '')) > 80 or octet_length((d->'data')::text) > 1000000 then
      raise exception 'document trop gros';
    end if;
    insert into public.crochet_docs (code, coll, id, data, deleted, server_at)
    values (p_code, d->>'coll', d->>'id', d->'data', coalesce((d->>'deleted')::boolean, false), clock_timestamp())
    on conflict (code, coll, id) do update
      set data = excluded.data,
          deleted = excluded.deleted,
          server_at = clock_timestamp()
      where coalesce((public.crochet_docs.data->>'updatedAt')::numeric, 0)
            <= coalesce((excluded.data->>'updatedAt')::numeric, 0);
  end loop;
  return clock_timestamp();
end;
$$;

create or replace function public.crochet_pull(p_code text, p_since timestamptz)
returns table (d_coll text, d_id text, d_data jsonb, d_deleted boolean, d_server_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.coll, c.id, c.data, c.deleted, c.server_at
  from public.crochet_docs c
  where length(coalesce(p_code, '')) >= 16
    and c.code = p_code
    and c.server_at > p_since
  order by c.server_at
  limit 500;
$$;

revoke all on function public.crochet_push(text, jsonb) from public, anon, authenticated;
revoke all on function public.crochet_pull(text, timestamptz) from public, anon, authenticated;
grant execute on function public.crochet_push(text, jsonb) to anon;
grant execute on function public.crochet_pull(text, timestamptz) to anon;

-- Dossier des photos et des PDF de patrons (50 Mo maximum par fichier).
-- Chaque fichier porte un identifiant aléatoire qui ne se devine pas. Le dossier est lisible par adresse directe,
-- mais on ne peut ni lister son contenu ni remplacer un fichier existant : l'appli ne fait qu'y AJOUTER des fichiers.
insert into storage.buckets (id, name, public, file_size_limit)
values ('crochet-files', 'crochet-files', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "crochet_files_insert" on storage.objects;
create policy "crochet_files_insert" on storage.objects
  for insert to anon
  with check (bucket_id = 'crochet-files');

-- Anciennes règles (versions précédentes de ce fichier) : retirées, c'est ce qui empêche de lister ou d'écraser les fichiers.
drop policy if exists "crochet_files_update" on storage.objects;
drop policy if exists "crochet_files_select" on storage.objects;
