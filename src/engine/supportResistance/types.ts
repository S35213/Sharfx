export type ZoneStrength = 'weak' | 'moderate' | 'strong'
export type ZoneType = 'support' | 'resistance'

export interface SRZone {
  minPrice: number
  maxPrice: number
  touches: number
  lastTouchTime: number
  type: ZoneType
  strength: ZoneStrength
}

export interface SupportResistanceResult {
  zones: SRZone[]
  nearestSupport: number | null
  nearestResistance: number | null
}
