-- The trigger already qualifies its table. Do not inherit the caller's search path.
ALTER FUNCTION workshop.protect_closed_cash() SET search_path = '';
