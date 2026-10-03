-- Corrige a paridade das permissoes de perfil depois da inclusao dos campos
-- email_recuperacao (0013) e avatar_url (0019).
-- A politica de UPDATE existente continua limitando a alteracao ao proprio id.

GRANT UPDATE (email_recuperacao, avatar_url) ON public.profiles TO authenticated;
