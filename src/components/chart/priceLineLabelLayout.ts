/**
 * Keep a price-line label visible even when its true-price line falls just
 * outside the current visible scale. The numeric price remains the real price;
 * only the label's screen Y is clamped to the chart's visible label rail.
 */
export const resolvePriceLabelY = (
  coordinate: number | null,
  price: number,
  referencePrice: number,
  minY: number,
  maxY: number,
): number => {
  const safeMin = Math.min(minY, maxY)
  const safeMax = Math.max(minY, maxY)
  if (coordinate !== null && Number.isFinite(coordinate)) {
    return Math.max(safeMin, Math.min(safeMax, coordinate))
  }
  return price >= referencePrice ? safeMin : safeMax
}
