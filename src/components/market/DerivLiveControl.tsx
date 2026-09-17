import React from 'react'
import type { OHLCV, Timeframe } from '../../types'
import { ProviderLiveControl } from './ProviderLiveControl'

interface DerivLiveControlProps {
  symbol: string
  timeframe: Timeframe
  onUpdate: (candles: OHLCV[], price: number, epoch: number) => void
  onActiveChange?: (active: boolean) => void
}

export const DerivLiveControl: React.FC<DerivLiveControlProps> = (props) => <ProviderLiveControl providerId="deriv" {...props} />
