export const isPriceLevelOccludedByQuote = (
  levelY: number | null,
  quoteYs: readonly (number | null)[],
  tolerancePx = 7,
): boolean => {
  if (levelY === null || !Number.isFinite(levelY) || !Number.isFinite(tolerancePx) || tolerancePx < 0) return false
  return quoteYs.some((quoteY) =>
    quoteY !== null && Number.isFinite(quoteY) && Math.abs(levelY - quoteY) <= tolerancePx,
  )
}
