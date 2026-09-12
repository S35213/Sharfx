export interface LearningTrade {
  symbol: string
  direction: 'BUY' | 'SELL'
  profit?: number
  riskRewardRatio?: number
  reason?: string
}

export interface AgentLesson {
  key: string
  lesson: string
  sampleSize: number
  winRate: number
  avgProfit: number
}

export interface AgentLearningSummary {
  lessons: AgentLesson[]
  cautionKeys: string[]
  confidenceAdjustment: number
  summary: string
}

const finite = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value)

export const learnFromTrades = (trades: LearningTrade[]): AgentLearningSummary => {
  const groups = new Map<string, LearningTrade[]>()
  for (const trade of trades) {
    const key = `${trade.symbol}:${trade.direction}`
    const group = groups.get(key) ?? []
    group.push(trade)
    groups.set(key, group)
  }
  const lessons: AgentLesson[] = []
  const cautionKeys: string[] = []
  for (const [key, group] of groups) {
    const outcomes = group.filter((trade) => finite(trade.profit))
    if (outcomes.length === 0) continue
    const wins = outcomes.filter((trade) => (trade.profit ?? 0) > 0).length
    const avgProfit = outcomes.reduce((sum, trade) => sum + (trade.profit ?? 0), 0) / outcomes.length
    const winRate = (wins / outcomes.length) * 100
    const lesson = winRate < 40
      ? `${key} has underperformed in the recorded simulator history; require stronger confluence before repeating it.`
      : winRate >= 60
        ? `${key} has performed positively in the recorded simulator history; treat that as evidence, not a guarantee.`
        : `${key} has mixed simulator results; keep normal confirmation requirements.`
    lessons.push({ key, lesson, sampleSize: outcomes.length, winRate, avgProfit })
    if (outcomes.length >= 3 && winRate < 40) cautionKeys.push(key)
  }
  const adjustment = cautionKeys.length > 0 ? -10 : lessons.some((lesson) => lesson.sampleSize >= 3 && lesson.winRate >= 60) ? 5 : 0
  const summary = lessons.length === 0
    ? 'No completed simulator history is available, so the agent will not pretend it has learned a historical edge.'
    : `${lessons.length} historical pattern${lessons.length === 1 ? '' : 's'} reviewed; ${cautionKeys.length} pattern${cautionKeys.length === 1 ? '' : 's'} marked for caution.`
  return { lessons, cautionKeys, confidenceAdjustment: adjustment, summary }
}
