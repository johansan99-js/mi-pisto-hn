-- Aplicada en Supabase el 2026-09-26 (proyecto de Mi Pisto HN).
-- Ruta de búsqueda fija en las funciones de los triggers (aviso 0011 del linter)
alter function public.set_updated_at() set search_path = '';
alter function public.bump_encrypted_states_version() set search_path = '';

-- Políticas repetidas: quedan las users_* (mismas condiciones: auth.uid() = user_id)
drop policy if exists "select propio" on public.encrypted_states;
drop policy if exists "insert propio" on public.encrypted_states;
drop policy if exists "update propio" on public.encrypted_states;
drop policy if exists "select propio" on public.device_log;
drop policy if exists "insert propio" on public.device_log;
drop policy if exists "update propio" on public.device_log;

-- Estado final esperado:
--   encrypted_states: users_select/insert/update/delete_own_state  (auth.uid() = user_id)
--   device_log:       users_manage_own_devices                     (auth.uid() = user_id)
--   eliminar_mi_cuenta(): SECURITY DEFINER a propósito, borra solo la cuenta de quien la llama
