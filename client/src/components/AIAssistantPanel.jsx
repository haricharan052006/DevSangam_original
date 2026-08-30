import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { AlertCircle, Bug, Check, Copy, FileCode2, MessageSquareText, Sparkles, X, Zap } from 'lucide-react'

const ACTIONS = [
  { key: 'review', label: 'Review Code', icon: Bug },
  { key: 'optimize', label: 'Optimize Efficiency', icon: Zap },
  { key: 'explain', label: 'Explain Code', icon: MessageSquareText },
]

// rehype-highlight wraps tokens in nested <span> elements, so the code
// block's plain text isn't available as a single string prop anywhere —
// this walks the rendered children tree to reconstruct it for copy/apply.
function extractText(node) {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node.props?.children != null) return extractText(node.props.children)
  return ''
}

function CodeBlock({ children, onApply, canApply }) {
  const [copied, setCopied] = useState(false)
  const code = extractText(children).replace(/\n$/, '')

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group relative my-2">
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={handleCopy}
          title="Copy code"
          className="rounded-md border border-ice/15 bg-graphite/95 p-1.5 text-fog hover:bg-panel"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
        {canApply && (
          <button
            onClick={() => onApply(code)}
            title="Apply to editor"
            className="flex items-center gap-1 rounded-md border border-electric-violet/60 bg-electric-violet/95 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-bright-violet"
          >
            <FileCode2 size={13} /> Apply
          </button>
        )}
      </div>
      <pre className="overflow-x-auto rounded-lg border border-ice/10 bg-[#0d1117] p-3 text-[12.5px] leading-relaxed">
        {children}
      </pre>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2.5 p-4">
      {[86, 94, 60, 100, 76, 40].map((width, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-graphite" style={{ width: `${width}%` }} />
      ))}
    </div>
  )
}

export default function AIAssistantPanel({
  open,
  onClose,
  loading,
  action,
  markdown,
  error,
  onRunAction,
  onApply,
  canApply,
  disabled,
  activeFileName,
}) {
  if (!open) return null

  const markdownComponents = {
    code({ className, children, ...props }) {
      const isBlock = /language-/.test(className || '')
      if (!isBlock) {
        return (
          <code className="rounded bg-graphite px-1 py-0.5 text-[13px] text-bright-violet" {...props}>
            {children}
          </code>
        )
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      )
    },
    pre({ children }) {
      return (
        <CodeBlock onApply={onApply} canApply={canApply}>
          {children}
        </CodeBlock>
      )
    },
  }

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-ice/10 bg-carbon">
      <div className="flex items-center justify-between border-b border-ice/10 px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-ice">
          <Sparkles size={16} className="text-electric-violet" /> AI Assistant
        </span>
        <button onClick={onClose} className="text-fog hover:text-ice" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-ice/10 px-3 py-2.5">
        {ACTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onRunAction(key)}
            disabled={disabled || loading}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              action === key && (loading || markdown)
                ? 'border-electric-violet bg-electric-violet/20 text-bright-violet'
                : 'border-ice/15 text-fog hover:bg-graphite'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {disabled && (
          <p className="p-4 text-sm text-steel">Select or create a file to use the AI Assistant.</p>
        )}

        {!disabled && loading && <LoadingSkeleton />}

        {!disabled && !loading && error && (
          <div className="m-3 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            <AlertCircle size={16} className="shrink-0" /> {error}
          </div>
        )}

        {!disabled && !loading && !error && !markdown && (
          <p className="p-4 text-sm text-steel">
            Choose an action above to analyze{activeFileName ? ` "${activeFileName}"` : ' the current file'}
            {' — reviews for bugs, suggests optimizations, or explains what the code does.'}
          </p>
        )}

        {!disabled && !loading && !error && markdown && (
          <div className="ai-markdown px-3 py-3 text-sm text-ice">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </aside>
  )
}
