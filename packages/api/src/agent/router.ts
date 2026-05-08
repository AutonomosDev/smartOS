/**
 * Router heurístico — elige modelo por complejidad de la query.
 * MVP: regex + longitud. Más adelante embeddings.
 *
 * Tiers:
 *   light  → claude-haiku-4-5  ($1/MTok in, $5/MTok out)
 *            queries simples factuales
 *   standard → claude-sonnet-4-5 ($3/MTok in, $15/MTok out)
 *            razonamiento, comparaciones, juicio
 */

const MODEL_LIGHT = process.env.SMARTOS_CHAT_LIGHT ?? "claude-haiku-4-5";
const MODEL_STANDARD = process.env.SMARTOS_CHAT_MODEL ?? "claude-sonnet-4-5";

// Indicadores LIGHT: queries directas pidiendo dato puntual
const LIGHT_PATTERNS = [
  /^¿?\s*(c[ua]á?ntos?|cu[áa]ntas?)\s/i,                    // "¿cuántos animales..."
  /^¿?\s*(qu[ée]|cu[áa]l)\s+es\s+(el|la|los|las)\s/i,       // "¿qué es el peso..."
  /^¿?\s*(d[áa]me|mostr[áa]me|listame|ens[eé][ñn]ame)\s/i,  // "dame el listado"
  /^¿?\s*(estado|resumen|dashboard|kpis?|inventario)\b/i,    // "estado del feedlot"
  /^¿?\s*(detalle|ficha|info)\s+(del?|de\s+la)\s+(diio|animal|venta)\b/i,
];

// Indicadores STANDARD: razonamiento, comparación, juicio, hipótesis
const STANDARD_PATTERNS = [
  /\b(por\s*qu[ée]|porqu[ée])\b/i,                          // "¿por qué..."
  /\b(compar[áaa]?|vs\.?|versus|diferencia|mejor|peor)\b/i,
  /\b(an[áa]liz[áa]?|analiza|hip[óo]tesis|expli[ckc][áa]?)\b/i,
  /\b(deber[íi]a|conviene|recomend[áa]?|vale\s+la\s+pena)\b/i,
  /\b(predic[ce]|proyec[ct][áa]?|estim[áa]?)\b/i,
  /\b(tendencia|patr[óo]n|correlaci[óo]n)\b/i,
];

export type Tier = "light" | "standard";

export type RouteDecision = {
  tier: Tier;
  model: string;
  reason: string;
};

export function pickModel(
  messages: { role: string; content: string }[]
): RouteDecision {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return {
      tier: "standard",
      model: MODEL_STANDARD,
      reason: "no_user_message",
    };
  }
  const text = lastUser.content.trim();

  // Override por env
  if (process.env.SMARTOS_FORCE_TIER === "light") {
    return { tier: "light", model: MODEL_LIGHT, reason: "env_override" };
  }
  if (process.env.SMARTOS_FORCE_TIER === "standard") {
    return { tier: "standard", model: MODEL_STANDARD, reason: "env_override" };
  }

  // STANDARD si matchea razonamiento
  for (const re of STANDARD_PATTERNS) {
    if (re.test(text)) {
      return {
        tier: "standard",
        model: MODEL_STANDARD,
        reason: `standard_pattern: ${re.source.slice(0, 30)}`,
      };
    }
  }

  // LIGHT si matchea factual + longitud razonable
  if (text.length <= 200) {
    for (const re of LIGHT_PATTERNS) {
      if (re.test(text)) {
        return {
          tier: "light",
          model: MODEL_LIGHT,
          reason: `light_pattern: ${re.source.slice(0, 30)}`,
        };
      }
    }
  }

  // Default conservador
  return {
    tier: "standard",
    model: MODEL_STANDARD,
    reason: "default",
  };
}

// Precios (USD por millón de tokens)
export const TIER_PRICING = {
  light: {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheCreate: 1.25,
  },
  standard: {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheCreate: 3.75,
  },
} as const;
