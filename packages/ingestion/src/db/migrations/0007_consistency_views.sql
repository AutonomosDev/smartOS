-- Vistas de consistencia entre tablas Silver.
-- No materializadas: postgres recompila al consultar
-- (volúmenes actuales toleran sin problema).

-- 1) Animales con estado=Vivo en inventario que aparecen en bajas
CREATE OR REPLACE VIEW v_zombies_bajas AS
SELECT a.id          AS animal_id,
       a.diio,
       a.estado      AS estado_inventario,
       b.fecha_baja,
       b.motivo,
       b.detalle
FROM animales a
JOIN bajas b ON b.diio = a.diio
WHERE a.estado = 'Vivo';

-- 2) Animales con estado=Vivo pero con pesaje "PESAJE DESDE VENTA"
CREATE OR REPLACE VIEW v_zombies_vendidos AS
SELECT a.id          AS animal_id,
       a.diio,
       a.estado      AS estado_inventario,
       MAX(p.fecha_pesaje) AS fecha_venta_inferida,
       MAX(p.peso_kg) AS peso_venta_inferido
FROM animales a
JOIN pesajes p
  ON p.diio = a.diio
 AND p.observaciones = 'PESAJE DESDE VENTA'
WHERE a.estado = 'Vivo'
GROUP BY a.id, a.diio, a.estado;

-- 3) DIIOs con pesajes pero sin estar en animales
CREATE OR REPLACE VIEW v_pesajes_huerfanos AS
SELECT p.diio,
       COUNT(*)            AS pesajes_count,
       MIN(p.fecha_pesaje) AS primer_pesaje,
       MAX(p.fecha_pesaje) AS ultimo_pesaje
FROM pesajes p
WHERE NOT EXISTS (SELECT 1 FROM animales a WHERE a.diio = p.diio)
GROUP BY p.diio;

-- 4) Tratamientos con fecha posterior a baja del mismo animal
CREATE OR REPLACE VIEW v_tratamientos_a_muertos AS
SELECT t.diio,
       t.fecha_tratamiento,
       t.medicamento_nombre,
       b.fecha_baja,
       b.motivo,
       (t.fecha_tratamiento - b.fecha_baja) AS dias_post_baja
FROM tratamientos t
JOIN bajas b ON b.diio = t.diio
WHERE t.fecha_tratamiento > b.fecha_baja;

-- 5) Animales activos sin pesaje en últimos 60 días
CREATE OR REPLACE VIEW v_inventario_stale AS
SELECT a.diio,
       a.tipo_ganado,
       a.ultimo_peso_kg,
       a.ultimo_peso_at,
       CASE
         WHEN a.ultimo_peso_at IS NULL THEN NULL
         ELSE (CURRENT_DATE - a.ultimo_peso_at)
       END AS dias_sin_pesaje
FROM animales a
WHERE a.estado = 'Vivo'
  AND (a.ultimo_peso_at IS NULL
       OR a.ultimo_peso_at < CURRENT_DATE - INTERVAL '60 days');
