export const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python', ext: 'py', monaco: 'python', badge: 'bg-blue-500', text: 'text-blue-400' },
  {
    value: 'javascript',
    label: 'JavaScript',
    ext: 'js',
    monaco: 'javascript',
    badge: 'bg-yellow-400 text-slate-900',
    text: 'text-yellow-400',
  },
  { value: 'cpp', label: 'C++', ext: 'cpp', monaco: 'cpp', badge: 'bg-purple-500', text: 'text-purple-400' },
  { value: 'c', label: 'C', ext: 'c', monaco: 'c', badge: 'bg-sky-500', text: 'text-sky-400' },
  { value: 'java', label: 'Java', ext: 'java', monaco: 'java', badge: 'bg-orange-500', text: 'text-orange-400' },
]

const FALLBACK = { badge: 'bg-slate-600', text: 'text-slate-400', monaco: 'plaintext' }

export function getLanguageMeta(value) {
  const found = LANGUAGE_OPTIONS.find((l) => l.value === value)
  if (found) return found
  return { value: value || 'text', label: value || 'Plain text', ext: 'txt', ...FALLBACK }
}
