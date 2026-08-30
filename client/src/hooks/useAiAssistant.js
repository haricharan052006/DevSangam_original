import { useCallback, useState } from 'react'
import { api } from '../lib/api'

export function useAiAssistant(token) {
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState(null) // last action run: 'review' | 'optimize' | 'explain' | null
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')

  const runAction = useCallback(
    async (nextAction, { code, language, selection }) => {
      setLoading(true)
      setError('')
      setAction(nextAction)
      try {
        const data = await api.analyzeCode(token, { code, language, action: nextAction, selection })
        setMarkdown(data.markdown)
      } catch (err) {
        setError(err.message || 'AI request failed')
        setMarkdown('')
      } finally {
        setLoading(false)
      }
    },
    [token]
  )

  const reset = useCallback(() => {
    setMarkdown('')
    setError('')
    setAction(null)
  }, [])

  return { loading, action, markdown, error, runAction, reset }
}
