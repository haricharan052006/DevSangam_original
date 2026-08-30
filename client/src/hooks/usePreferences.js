import { useEffect, useState } from 'react'
import { loadPreferences, savePreferences, subscribePreferences } from '../lib/preferences'

export function usePreferences() {
  const [preferences, setPreferences] = useState(loadPreferences)

  useEffect(() => subscribePreferences(setPreferences), [])

  function updatePreferences(patch) {
    setPreferences(savePreferences(patch))
  }

  return { preferences, updatePreferences }
}
