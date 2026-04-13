import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeNutritionAlerts,
  getLocalHour,
  DEFAULT_NUTRITION_ALERT_PREFS,
} from '../website/js/nutrition-alerts.mjs'

test('DEFAULT_NUTRITION_ALERT_PREFS has expected keys', () => {
  assert.equal(DEFAULT_NUTRITION_ALERT_PREFS.nutrition_protein_low, true)
  assert.equal(DEFAULT_NUTRITION_ALERT_PREFS.meal_logging_reminder, true)
})

test('getLocalHour returns 0-23', () => {
  const h = getLocalHour('UTC')
  assert.ok(h >= 0 && h <= 23)
})

test('protein_low when under 70% of target', () => {
  const alerts = computeNutritionAlerts({
    summary: { total_protein_g: 50, total_calories: 2000 },
    targets: { protein_g: 200, calories_kcal: 3000 },
    foodLogCount: 2,
    localHour: 14,
    prefs: { nutrition_protein_low: true },
  })
  const p = alerts.find((a) => a.code === 'protein_low')
  assert.ok(p, 'expected protein_low')
  assert.equal(p.level, 'warn')
})

test('no protein alert when above threshold', () => {
  const alerts = computeNutritionAlerts({
    summary: { total_protein_g: 180, total_calories: 2500 },
    targets: { protein_g: 200, calories_kcal: 3000 },
    foodLogCount: 3,
    localHour: 12,
    prefs: { nutrition_protein_low: true },
  })
  assert.equal(alerts.find((a) => a.code === 'protein_low'), undefined)
})

test('calories_low only after 17:00 local', () => {
  const low = computeNutritionAlerts({
    summary: { total_calories: 1000, total_protein_g: 150 },
    targets: { calories_kcal: 3000, protein_g: 200 },
    foodLogCount: 2,
    localHour: 18,
    prefs: { nutrition_calories_low: true, nutrition_protein_low: false },
  })
  assert.ok(low.some((a) => a.code === 'calories_low'))

  const noon = computeNutritionAlerts({
    summary: { total_calories: 500, total_protein_g: 80 },
    targets: { calories_kcal: 3000, protein_g: 200 },
    foodLogCount: 1,
    localHour: 12,
    prefs: { nutrition_calories_low: true, nutrition_protein_low: false },
  })
  assert.equal(noon.find((a) => a.code === 'calories_low'), undefined)
})

test('meal_logging_reminder when no logs and hour in window', () => {
  const alerts = computeNutritionAlerts({
    summary: { total_calories: 0, total_protein_g: 0 },
    targets: null,
    foodLogCount: 0,
    localHour: 11,
    prefs: { meal_logging_reminder: true, nutrition_protein_low: false, nutrition_calories_low: false },
  })
  assert.ok(alerts.some((a) => a.code === 'log_meals'))
})

test('prefs can disable alerts', () => {
  const alerts = computeNutritionAlerts({
    summary: { total_protein_g: 10, total_calories: 100 },
    targets: { protein_g: 200, calories_kcal: 3000 },
    foodLogCount: 0,
    localHour: 18,
    prefs: {
      nutrition_protein_low: false,
      nutrition_calories_low: false,
      meal_logging_reminder: false,
    },
  })
  assert.equal(alerts.length, 0)
})
