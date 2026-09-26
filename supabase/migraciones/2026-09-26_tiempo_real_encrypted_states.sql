-- Aplicada el 2026-09-26 en el proyecto aetaktkexbtluoxehuwi.
-- Avisar en tiempo real a los otros dispositivos de la misma cuenta cuando cambia su fila.
-- Realtime respeta RLS (users_select_own_state): cada usuario solo recibe los cambios de su propia fila.
-- Para revertir: alter publication supabase_realtime drop table public.encrypted_states;
alter publication supabase_realtime add table public.encrypted_states;
