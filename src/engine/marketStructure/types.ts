export type MarketBias = 'Bullish' | 'Bearish' | 'Sideways' | 'Unclear'
export type StructureStatus = 'Intact' | 'Broken' | 'Developing'
export type SwingType = 'high' | 'low'
export type SwingLabel = 'HH' | 'HL' | 'LH' | 'LL'

export interface SwingPoint {
  index: number
  price: number
  time: number
  type: SwingType
}

export interface ClassifiedSwing extends SwingPoint {
  label: SwingLabel | null
}

export interface MarketStructureResult {
  bias: MarketBias
  structureType: string
  status: StructureStatus
  swingHighs: ClassifiedSwing[]
  swingLows: ClassifiedSwing[]
  recentHigh: number | null
  recentLow: number | null
}
