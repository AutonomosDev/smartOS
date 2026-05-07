# Cattle Domain — smartOS Mollendo

Reglas de dominio ganadero específicas para interpretar data correctamente.

## Llenado ruminal — el artefacto más común

Cuando un bovino llega al feedlot:
- Viene de pasto/transporte ayunado, deshidratado
- Pesa "bajo" (estómago vacío, sin agua)
- En 7 días llena rumen con concentrado + agua → +30 a +50 kg sin
  haber crecido tejido real
- A partir del día 14-30 el llenado se estabiliza

**Implicación práctica:**
GDP calculado con solo 2 pesajes (ingreso + 30d) está INFLADO.
Real GDP requiere ≥3 pesajes y ≥60 días entre primer y último pesaje.

## Benchmarks Chile feedlot novillo

```
< 0.9 kg/d     malo
1.2-1.5        típico
1.5-1.8        bueno
1.8-2.0        techo biológico realista
> 2.0          BIOLÓGICAMENTE NO SOSTENIBLE
               casi siempre artefacto
```

## Reglas de validación cruzada

```
SI tipo_ganado IN ('Novillo','Vaquilla','Vaca','Toro','Torito')
   AND edad_meses < 6
   AND peso_kg > 200
ENTONCES flag = "edad_imposible"
         (probable error en fecha_nacimiento)

SI peso_kg < 0 OR peso_kg > 2000
ENTONCES rechazar (Zod)

SI gdp < 1.2 kg/d sostenido (≥3 pesajes, ≥60d)
ENTONCES flag = "reclamable"

SI 2 pesajes mismo (diio, fecha)
ENTONCES alarma operacional (raro pero posible si turnos distintos)
```

## Vocabulario chileno

```
DIIO              identificador visual del arete (8 dígitos
                  iniciando con 152 — código país Chile)
EID               RFID electrónico (chip en arete)
Mangada           grupo en frigorífico durante venta
Guía despacho     documento SII tributario
FMA               Formulario de Movimiento Animal sanitario SAG
Pasaporte         libro del animal (genealogía + sanitario)
Recría            etapa post-destete pre-feedlot (300-400 kg)
Engorda           feedlot (400-550 kg → venta)
Faena             matanza en frigorífico
PESAJE DESDE VENTA  observación del último pesaje pre-despacho
```

## Tipos de ganado válidos (enum)

```
Novillo      macho castrado en engorda
Vaquilla     hembra joven (sin parir)
Vaca         hembra adulta (parió ≥1 vez)
Toro         macho entero adulto
Torito       macho entero joven
Ternero      cría macho
Ternera      cría hembra
```

## Estados de animal (enum inventario)

```
Vivo         activo en feedlot
Vendido      salió por venta
Muerto       baja por muerte
Faenado      muerto en frigorífico
Baja         baja administrativa
```

## Resguardos sanitarios SAG (CRÍTICO legal)

Después de aplicar medicamento veterinario:
- `resguardo_carne_dias`: días que el animal NO PUEDE faenarse
- `resguardo_leche_dias`: días que la leche NO PUEDE consumirse
- `liberacion_carne` = `fecha_tratamiento + resguardo_carne_dias`
- `liberacion_leche` = `fecha_tratamiento + resguardo_leche_dias`

**Faenar antes de liberacion_carne = violación SAG sancionable.**

Por eso `liberacion_*` se CALCULAN nosotros desde fecha + resguardo.
NO se confía en el campo de AgroApp (puede tener bugs).

## Mortalidad esperada feedlot

```
< 0.5%       excelente
0.5-1.5%     normal
1.5-3%       alta (revisar manejo)
> 3%         alarma
```

Mollendo: **0.17% en 26 meses** → excelente.

## Cojera — patrón estacional Chile

Pico esperado: **junio-agosto** (invierno, humedad, barro).
Tratamientos preventivos deben aplicarse antes (mayo).

Mollendo confirmado:
- 2025-Q3 (jun-ago) = 13 casos = pico
- 2024 fue esporádico, 2025 explotó (10 → 36 casos)

## Cuándo "PESAJE DESDE VENTA" aparece

Es el ÚLTIMO pesaje antes de despachar al frigorífico.
- ~5.500 filas en Mollendo (cada venta histórica)
- Coincide en fecha con `ventas.fecha_venta`
- Permite reconstruir el detalle de venta sin necesidad
  de subir cada archivo de detalle individual
