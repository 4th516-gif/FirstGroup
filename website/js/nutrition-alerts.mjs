/**
 * Pure nutrition alert rules for Stonebound Performance PoC.
 * Served as static ES module; tests import the same file from ../website/js/
 */

export const DEFAULT_NUTRITION_ALERT_PREFS = {
  nutrition_protein_low: true,
  nutrition_calories_low: true,
  meal_logging_reminder: true,
}

/**
 * @param {string} [timeZone] IANA tz e.g. America/New_York
 */
export function getLocalHour(timeZone = 'UTC') {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date())
    const h = parts.find((p) => p.type === 'hour')
    if (h) return Math.min(23, Math.max(0, parseInt(h.value, 10)))
  } catch (_) {}
  return new Date().getUTCHours()
}

/**
 * @param {{
 *   summary: { total_calories?: number, total_protein_g?: number } | null
 *   targets: { calories_kcal?: number, protein_g?: number } | null
 *   foodLogCount: number
 *   localHour: number
 *   prefs: Record<string, boolean>
 * }} input
 * @returns {{ level: 'warn'|'info', code: string, title: string, message: string }[]}
 */
export function computeNutritionAlerts(input) {
  const prefs = { ...DEFAULT_NUTRITION_ALERT_PREFS, ...(input.prefs || {}) }
  const alerts = []
  const summary = input.summary || {}
  const targets = input.targets
  const cal = Number(summary.total_calories || 0)
  const pro = Number(summary.total_protein_g || 0)
  const tCal = targets ? Number(targets.calories_kcal) : 0
  const tPro = targets ? Number(targets.protein_g) : 0
  const hour = input.localHour
  const logs = input.foodLogCount

  if (prefs.nutrition_protein_low && tPro > 0) {
    const pct = (pro / tPro) * 100
    if (pct < 70) {
      alerts.push({
        level: 'warn',
        code: 'protein_low',
        title: 'Protein under target',
        message: `You are at about ${Math.round(pct)}% of today's protein goal (${Math.round(pro)}g / ${Math.round(tPro)}g). Add a lean protein source at your next meal.`,
      })
    }
  }

  if (prefs.nutrition_calories_low && tCal > 0 && hour >= 17) {
    const pct = (cal / tCal) * 100
    if (pct < 60) {
      alerts.push({
        level: 'warn',
        code: 'calories_low',
        title: 'Calories behind pace',
        message: `Intake is about ${Math.round(pct)}% of your calorie target for today. Consider a balanced snack or larger dinner portion if training load is high.`,
      })
    }
  }

  if (prefs.meal_logging_reminder && hour >= 10 && hour < 20 && logs === 0) {
    alerts.push({
      level: 'info',
      code: 'log_meals',
      title: "Log today's fueling",
      message: 'No meals logged yet today. Quick logs help your coach and targets stay accurate.',
    })
  }

  return alerts
}
