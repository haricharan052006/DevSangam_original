import { FileCode, Plus, Trash2 } from 'lucide-react'
import { getLanguageMeta } from '../lib/languages'

export default function FileSidebar({ files, activeFileId, onSelectFile, onRequestDelete, onNewFile, readOnly }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-ice/10 bg-carbon">
      <div className="flex items-center justify-between border-b border-ice/10 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-steel">Files</span>
        {!readOnly && (
          <button onClick={onNewFile} className="text-fog hover:text-ice" title="New file">
            <Plus size={16} />
          </button>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {files.map((file) => {
          const meta = getLanguageMeta(file.language)
          const isActive = file.id === activeFileId
          return (
            <li key={file.id}>
              <div
                onClick={() => onSelectFile(file.id)}
                className={`group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${
                  isActive ? 'bg-graphite text-ice' : 'text-fog hover:bg-graphite/60'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileCode size={16} className={`shrink-0 ${meta.text}`} />
                  <span className="truncate">{file.fileName}</span>
                </span>
                {!readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRequestDelete(file)
                    }}
                    className="shrink-0 text-steel opacity-0 hover:text-red-400 group-hover:opacity-100"
                    title="Delete file"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
