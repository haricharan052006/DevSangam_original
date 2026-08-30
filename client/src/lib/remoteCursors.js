import * as Y from 'yjs'

let styleEl = null
const injectedClasses = new Set()

function ensureStyleEl() {
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.setAttribute('data-devsangam', 'remote-cursors')
    document.head.appendChild(styleEl)
  }
  return styleEl
}

export function selectionClassName(color) {
  const safe = color.replace('#', '')
  const className = `yjs-sel-${safe}`
  if (!injectedClasses.has(className)) {
    injectedClasses.add(className)
    ensureStyleEl().appendChild(
      document.createTextNode(`.${className} { background-color: ${color}2e; border-left: 2px solid ${color}; }\n`)
    )
  }
  return className
}

export function decodeRemoteIndex(relativePosition, ydoc, ytext) {
  if (!relativePosition) return null
  try {
    const abs = Y.createAbsolutePositionFromRelativePosition(relativePosition, ydoc)
    if (!abs || abs.type !== ytext) return null
    return abs.index
  } catch {
    return null
  }
}
