-- Royal Imperial AI v1.0.27
-- Permite gestionar disponibilidad de planes desde Admin > Niveles.
-- Deja R1 y R2 disponibles inicialmente; R3 en adelante quedan como Próximamente hasta habilitarlos desde el panel admin.

UPDATE vip_packages
SET name = CASE level
  WHEN 1 THEN 'R1'
  WHEN 2 THEN 'R2'
  WHEN 3 THEN 'R3'
  WHEN 4 THEN 'R4'
  WHEN 5 THEN 'R5'
  WHEN 6 THEN 'R6'
  WHEN 7 THEN 'R7'
  WHEN 8 THEN 'R8'
  ELSE name
END,
is_purchasable = CASE
  WHEN level IN (1, 2) THEN true
  WHEN level >= 3 THEN false
  ELSE is_purchasable
END,
updated_at = NOW()
WHERE level BETWEEN 1 AND 8;
