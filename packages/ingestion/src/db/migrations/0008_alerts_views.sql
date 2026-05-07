-- Vistas adicionales para detectar anomalías y casos reclamables.
-- Se suman a las 5 vistas de consistencia del 0007.

-- 6) Animales con fecha_nacimiento imposible:
--    bovino adulto (peso > 200 kg) declarado como ternero (<6 meses)
--    Casos reales detectados: Hugo Reyes y Mario Hernandez
CREATE OR REPLACE VIEW v_edad_imposible AS
SELECT a.diio,
       a.tipo_ganado,
       a.fecha_nacimiento,
       a.fecha_ingreso,
       a.ultimo_peso_kg,
       a.origen,
       (CURRENT_DATE - a.fecha_nacimiento) AS edad_dias,
       ROUND(((CURRENT_DATE - a.fecha_nacimiento) / 30.0)::numeric, 1) AS edad_meses_aprox
FROM animales a
WHERE a.tipo_ganado IN ('Novillo', 'Vaquilla', 'Vaca', 'Toro', 'Torito')
  AND a.fecha_nacimiento IS NOT NULL
  AND (CURRENT_DATE - a.fecha_nacimiento) < 180   -- <6 meses
  AND a.ultimo_peso_kg > 200;                      -- pero pesa >200 kg

-- 7) Animales con GDP estabulado < 1.2 kg/d (reclamables al proveedor)
--    Requisitos: ≥3 pesajes, ≥60 días entre primer y último pesaje
--    Solo animales activos hoy (los que están en inventario)
CREATE OR REPLACE VIEW v_reclamables AS
WITH primer AS (
  SELECT diio,
         MIN(fecha_pesaje) AS f1,
         MAX(fecha_pesaje) AS f2,
         (MAX(fecha_pesaje) - MIN(fecha_pesaje)) AS dias,
         COUNT(*) AS n_pes
  FROM pesajes
  WHERE peso_kg > 0
  GROUP BY diio
  HAVING COUNT(*) >= 3
     AND (MAX(fecha_pesaje) - MIN(fecha_pesaje)) >= 60
),
gdp_calc AS (
  SELECT a.diio, a.dias, a.n_pes,
    (SELECT peso_kg::numeric FROM pesajes WHERE diio = a.diio AND fecha_pesaje = a.f1 LIMIT 1) AS p_ini,
    (SELECT peso_kg::numeric FROM pesajes WHERE diio = a.diio AND fecha_pesaje = a.f2 LIMIT 1) AS p_fin
  FROM primer a
)
SELECT
  c.proveedor,
  g.diio,
  g.dias,
  g.n_pes AS pesajes,
  g.p_ini AS peso_ingreso,
  g.p_fin AS peso_actual,
  (g.p_fin - g.p_ini) AS kg_ganados,
  ROUND(((g.p_fin - g.p_ini) / NULLIF(g.dias, 0)::numeric)::numeric, 3) AS gdp,
  CASE
    WHEN ((g.p_fin - g.p_ini) / NULLIF(g.dias, 0)::numeric) < 0   THEN 'critico_perdio_peso'
    WHEN ((g.p_fin - g.p_ini) / NULLIF(g.dias, 0)::numeric) < 0.8 THEN 'muy_bajo'
    WHEN ((g.p_fin - g.p_ini) / NULLIF(g.dias, 0)::numeric) < 1.2 THEN 'bajo_reclamable'
    ELSE 'aceptable'
  END AS severidad
FROM gdp_calc g
JOIN v_proveedor_canonico c ON c.diio = g.diio
WHERE c.estado = 'Vivo'
  AND ((g.p_fin - g.p_ini) / NULLIF(g.dias, 0)::numeric) < 1.2;
