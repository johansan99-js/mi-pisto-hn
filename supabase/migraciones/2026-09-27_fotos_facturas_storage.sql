-- Aplicada el 2026-09-27 en el proyecto aetaktkexbtluoxehuwi.
-- Fotos de facturas en la nube, cifradas en el teléfono antes de subir.
-- Carpeta privada: cada archivo va en "<user_id>/<id de la factura>" y cada
-- usuario solo puede leer, subir, cambiar y borrar lo de su propia carpeta.
-- Para revertir: borrar las 4 políticas facturas_* de storage.objects y el bucket 'facturas'
-- (vaciándolo antes desde el panel de Storage).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 1048576, array['application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "facturas_select_propias" on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "facturas_insert_propias" on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "facturas_update_propias" on storage.objects for update to authenticated
  using (bucket_id = 'facturas' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'facturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "facturas_delete_propias" on storage.objects for delete to authenticated
  using (bucket_id = 'facturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
