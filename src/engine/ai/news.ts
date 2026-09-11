import type { ExternalEvent, MarketEventSource } from './types'

/** No live news is exposed by the simulator. A future provider can implement this port. */
export class SimulatedNewsSource implements MarketEventSource {
  async getUpcomingEvents(_symbol: string, _now = 0): Promise<ExternalEvent[]> {
    return []
  }
}
