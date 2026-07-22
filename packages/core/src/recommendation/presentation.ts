import type {
  ClothingItem,
  RecommendationInput,
  RecommendationResult,
} from "../domain";

export type RecommendationPresentation = {
  wear: ClothingItem[];
  start: ClothingItem[] | null;
  carry: ClothingItem[];
  forReturn: ClothingItem[];
  returnSummary: string;
};

export function createRecommendationPresentation(
  input: RecommendationInput,
  result: RecommendationResult,
): RecommendationPresentation {
  const selected = result.variants.find((variant) => variant.id === result.selectedVariantId) ?? result.variants[0];
  const running = selected?.running ?? result.recommendation.running;
  const wear = running?.mainRun ?? selected?.outfit ?? result.recommendation.outfit;
  const start = running?.warmUp ?? null;
  const forReturn = running?.postRun ?? selected?.outfit ?? result.recommendation.outfit;
  const carry = running
    ? uniqueItems([...(start ?? []), ...forReturn].filter((item) => !wear.includes(item)))
    : [];
  const delta = input.forecastAtReturn.feelsLikeC - input.current.feelsLikeC;

  return {
    wear,
    start,
    carry,
    forReturn,
    returnSummary: describeReturn(delta),
  };
}

function describeReturn(delta: number) {
  const rounded = Math.abs(Math.round(delta * 10) / 10);
  if (delta <= -3) return `The return feels ${rounded} C colder. Keep the return layers available.`;
  if (delta >= 3) return `The return feels ${rounded} C warmer. Remove only non-required layers if needed.`;
  return "Return conditions stay close to the start; the selected outfit remains suitable.";
}

function uniqueItems(items: ClothingItem[]) {
  return Array.from(new Set(items));
}
