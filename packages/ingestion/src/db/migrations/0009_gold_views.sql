-- Capa 3 (Gold) — vistas de negocio consolidadas para Mollendo.
-- Construidas sobre Silver + vistas de Capa 0007/0008.

-- ──────────────────────────────────────────────────
-- 1) v_estancia_animal
--    Por cada animal activo: días en feedlot, pesos, GDP
--    Excluye llenado ruminal: solo si ≥3 pesajes
-- ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_estancia_animal AS
WITH ag AS (
  SELECT p.diio,
         MIN(p.fecha_pesaje) AS primer_pesaje,
         MAX(p.fecha_pesaje) AS ultimo_pesaje,
         (MAX(p.fecha_pesaje) - MIN(p.fecha_pesaje)) AS dias,
         COUNT(*) AS n_pesajes
  FROM pesajes p
  WHERE p.peso_kg > 0
  GROUP BY p.diio
)
SELECT
  c.proveedor,
  a.diio,
  a.tipo_ganado,
  a.fecha_ingreso,
  ag.primer_pesaje,
  ag.ultimo_pesaje,
  ag.dias AS dias_estabulado,
  ag.n_pesajes,
  (SELECT peso_kg::numeric FROM pesajes WHERE diio = a.diio
   ORDER BY fecha_pesaje LIMIT 1) AS peso_ingreso,
  a.ultimo_peso_kg AS peso_actual,
  (a.ultimo_peso_kg -
   (SELECT peso_kg::numeric FROM pesajes WHERE diio = a.diio
    ORDER BY fecha_pesaje LIMIT 1)) AS kg_ganados,
  CASE
    WHEN ag.n_pesajes >= 3 AND ag.dias >= 60 THEN
      ROUND(((a.ultimo_peso_kg -
              (SELECT peso_kg::numeric FROM pesajes WHERE diio = a.diio
               ORDER BY fecha_pesaje LIMIT 1)) /
             NULLIF(ag.dias, 0)::numeric)::numeric, 3)
    ELSE NULL
  END AS gdp_confiable,
  CASE
    WHEN ag.n_pesajes < 3 OR ag.dias < 60 THEN 'no_confiable_pocos_datos'
    ELSE 'confiable'
  END AS calidad_gdp
FROM animales a
JOIN ag ON ag.diio = a.diio
LEFT JOIN v_proveedor_canonico c ON c.diio = a.diio
WHERE a.estado = 'Vivo';

-- ──────────────────────────────────────────────────
-- 2) v_zona_dinero
--    Animales activos cerca de venta (≥450 kg)
--    Estimación de valor a precio referencia
-- ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_zona_dinero AS
SELECT
  e.proveedor,
  e.diio,
  e.tipo_ganado,
  e.peso_actual,
  e.dias_estabulado,
  e.gdp_confiable,
  ROUND((e.peso_actual * 1.5)::numeric, 0) AS valor_estimado_usd,
  CASE
    WHEN e.peso_actual >= 530 THEN 'venta_inmediata'
    WHEN e.peso_actual >= 500 THEN 'venta_proxima_30d'
    ELSE 'venta_proxima_60d'
  END AS prioridad
FROM v_estancia_animal e
WHERE e.peso_actual >= 450;

-- ──────────────────────────────────────────────────
-- 3) v_ranking_proveedor
--    Solo animales con GDP confiable (≥3 pesajes, ≥60d)
--    Excluye cohortes nuevas (artefacto llenado ruminal)
-- ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_ranking_proveedor AS
SELECT
  proveedor,
  COUNT(*) AS animales_activos,
  COUNT(*) FILTER (WHERE calidad_gdp = 'confiable') AS animales_evaluables,
  ROUND(AVG(peso_actual)::numeric, 1) AS peso_actual_avg,
  ROUND(AVG(dias_estabulado)::numeric, 0) AS dias_avg,
  ROUND(AVG(gdp_confiable)::numeric, 3) AS gdp_avg,
  ROUND(MIN(gdp_confiable)::numeric, 3) AS gdp_min,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gdp_confiable)::numeric, 3) AS gdp_mediana,
  COUNT(*) FILTER (WHERE gdp_confiable < 1.2) AS reclamables,
  ROUND(100.0 * COUNT(*) FILTER (WHERE gdp_confiable < 1.2) /
        NULLIF(COUNT(*) FILTER (WHERE calidad_gdp = 'confiable'), 0), 1) AS pct_reclamable
FROM v_estancia_animal
WHERE proveedor IS NOT NULL
GROUP BY proveedor;

-- ──────────────────────────────────────────────────
-- 4) v_alarmas_resguardo_carne
--    Animales con liberación carne FUTURA (no faenable hoy)
-- ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_alarmas_resguardo_carne AS
SELECT
  t.diio,
  t.fecha_tratamiento,
  t.medicamento_nombre,
  t.medicamento_sag,
  t.diagnostico,
  t.resguardo_carne_dias,
  t.liberacion_carne,
  (t.liberacion_carne - CURRENT_DATE) AS dias_faltantes
FROM tratamientos t
WHERE t.liberacion_carne > CURRENT_DATE
ORDER BY t.liberacion_carne ASC;

-- ──────────────────────────────────────────────────
-- 5) v_kpis_mensuales
--    Estacionalidad: ventas, kg, cojera, mortalidad por mes
-- ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_kpis_mensuales AS
WITH meses AS (
  SELECT TO_CHAR(d::date, 'YYYY-MM') AS mes
  FROM generate_series('2024-03-01'::date, CURRENT_DATE, '1 month'::interval) d
),
ventas_mes AS (
  SELECT TO_CHAR(fecha_venta, 'YYYY-MM') AS mes,
         COUNT(*) AS n_ventas,
         SUM(cantidad_animales) AS animales_vendidos,
         SUM(peso_total_kg)::numeric AS kg_vendidos
  FROM ventas GROUP BY 1
),
trat_mes AS (
  SELECT TO_CHAR(fecha_tratamiento, 'YYYY-MM') AS mes,
         COUNT(*) FILTER (WHERE diagnostico = 'cojera') AS cojera,
         COUNT(*) AS tratamientos_total
  FROM tratamientos GROUP BY 1
),
bajas_mes AS (
  SELECT TO_CHAR(fecha_baja, 'YYYY-MM') AS mes, COUNT(*) AS bajas
  FROM bajas GROUP BY 1
)
SELECT
  m.mes,
  COALESCE(v.n_ventas, 0) AS ventas,
  COALESCE(v.animales_vendidos, 0) AS animales_vendidos,
  COALESCE(v.kg_vendidos, 0) AS kg_vendidos,
  COALESCE(t.cojera, 0) AS cojera,
  COALESCE(t.tratamientos_total, 0) AS tratamientos,
  COALESCE(b.bajas, 0) AS bajas
FROM meses m
LEFT JOIN ventas_mes v ON v.mes = m.mes
LEFT JOIN trat_mes t ON t.mes = m.mes
LEFT JOIN bajas_mes b ON b.mes = m.mes
ORDER BY m.mes;

-- ──────────────────────────────────────────────────
-- 6) v_dashboard_mollendo (cabecera ejecutiva)
-- ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_dashboard_mollendo AS
SELECT
  CURRENT_DATE AS fecha_reporte,
  -- inventario
  (SELECT COUNT(*) FROM animales WHERE estado = 'Vivo') AS animales_activos,
  (SELECT ROUND(SUM(ultimo_peso_kg)::numeric, 0)
   FROM animales WHERE estado = 'Vivo') AS kg_totales_activos,
  (SELECT ROUND(AVG(ultimo_peso_kg)::numeric, 1)
   FROM animales WHERE estado = 'Vivo') AS peso_avg_activos,
  -- gdp
  (SELECT ROUND(AVG(gdp_confiable)::numeric, 3)
   FROM v_estancia_animal WHERE calidad_gdp = 'confiable') AS gdp_avg_confiable,
  (SELECT COUNT(*) FROM v_estancia_animal WHERE calidad_gdp = 'confiable') AS gdp_animales_evaluables,
  -- zona dinero
  (SELECT COUNT(*) FROM v_zona_dinero) AS animales_zona_venta,
  (SELECT ROUND(SUM(valor_estimado_usd)::numeric, 0)
   FROM v_zona_dinero) AS valor_zona_venta_usd,
  -- alarmas
  (SELECT COUNT(*) FROM v_alarmas_resguardo_carne) AS alarmas_resguardo_carne,
  (SELECT COUNT(*) FROM v_reclamables) AS animales_reclamables,
  (SELECT COUNT(*) FROM v_inventario_stale) AS animales_sin_pesar_60d,
  (SELECT COUNT(*) FROM v_edad_imposible) AS animales_edad_imposible,
  -- histórico
  (SELECT COUNT(*) FROM ventas) AS ventas_historicas_total,
  (SELECT COUNT(*) FROM bajas) AS bajas_historicas_total,
  (SELECT COUNT(*) FROM tratamientos) AS tratamientos_historicos_total,
  (SELECT ROUND((100.0 * COUNT(*) FILTER (WHERE diagnostico = 'cojera') / NULLIF(COUNT(*),0))::numeric, 1)
   FROM tratamientos) AS pct_tratamientos_cojera;
