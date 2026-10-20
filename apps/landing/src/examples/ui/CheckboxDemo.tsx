import { Text, View } from '@hozo/core'
import { Checkbox } from '@hozo/ui'
import { useState } from 'react'

const MEALS = ['Breakfast', 'Lunch', 'Dinner']

export function CheckboxDemo() {
  const [meals, setMeals] = useState<string[]>(['Lunch'])
  const all = meals.length === MEALS.length ? true : meals.length === 0 ? false : 'mixed'
  return (
    <View className="gap-2">
      <Checkbox checked={all} onCheckedChange={(next) => setMeals(next ? MEALS : [])}>
        All meals
      </Checkbox>
      {MEALS.map((meal) => (
        <Checkbox
          key={meal}
          className="ps-6"
          checked={meals.includes(meal)}
          onCheckedChange={(next) =>
            setMeals((chosen) => (next ? [...chosen, meal] : chosen.filter((m) => m !== meal)))
          }
        >
          {meal}
        </Checkbox>
      ))}
      <Text className="text-sm text-hozo-text-muted">Chosen: {meals.join(', ') || 'none'}</Text>
    </View>
  )
}
