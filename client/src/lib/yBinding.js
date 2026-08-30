import { createMutex } from 'lib0/mutex'

// Minimal Y.Text <-> Monaco model binding, hand-rolled to avoid pulling in
// y-monaco (which hard-imports the `monaco-editor` npm package). Our editor is
// loaded from a CDN via @monaco-editor/react, so a second bundled copy of
// monaco-editor would create two separate Monaco module instances sharing
// nothing — a class of bug not worth risking. This mirrors the text-sync half
// of y-monaco's MonacoBinding; presence/cursor sync is handled separately.
//
// A single mutex guards BOTH directions (model->ytext and ytext->model), not
// just one: Y.Doc fires its 'observe' callbacks synchronously as part of the
// same transaction that triggered them, so a local edit's ytext.insert(),
// still inside the model's onDidChangeContent handler, re-enters this same
// binding's ytext observer before that handler returns. Guarding only the
// remote->model direction (as a lone boolean flag would) doesn't stop that
// echo — the mutex has to block re-entry in either direction.
export function bindYTextToModel(ytext, model, ydoc, monacoInstance) {
  const mutex = createMutex()

  function applyRemoteEvent(event) {
    mutex(() => {
      let index = 0
      event.delta.forEach((op) => {
        if (op.retain !== undefined) {
          index += op.retain
        } else if (op.insert !== undefined) {
          const pos = model.getPositionAt(index)
          const range = new monacoInstance.Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column)
          model.applyEdits([{ range, text: op.insert }])
          index += op.insert.length
        } else if (op.delete !== undefined) {
          const startPos = model.getPositionAt(index)
          const endPos = model.getPositionAt(index + op.delete)
          const range = new monacoInstance.Selection(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column
          )
          model.applyEdits([{ range, text: '' }])
        }
      })
    })
  }

  ytext.observe(applyRemoteEvent)

  const initialValue = ytext.toString()
  if (model.getValue() !== initialValue) {
    model.setValue(initialValue)
  }

  const changeSub = model.onDidChangeContent((event) => {
    mutex(() => {
      ydoc.transact(() => {
        event.changes
          .slice()
          .sort((a, b) => b.rangeOffset - a.rangeOffset)
          .forEach((change) => {
            ytext.delete(change.rangeOffset, change.rangeLength)
            ytext.insert(change.rangeOffset, change.text)
          })
      }, 'local-edit')
    })
  })

  return function unbind() {
    ytext.unobserve(applyRemoteEvent)
    changeSub.dispose()
  }
}

// Hard invariant, on top of correct effect-cleanup ordering: at most one live
// binding per collab room, ever. If a second bind attempt for the same room
// arrives before the first was released — a StrictMode double-invoke racing
// an async provider teardown, a stale HMR closure, or any future bug — this
// forces the stale one to tear down immediately rather than letting two
// bindings silently double-apply the same keystroke to the same Y.Text.
const activeRoomBindings = new Map() // roomName -> release function

export function claimRoomBinding(roomName, teardown) {
  const stale = activeRoomBindings.get(roomName)
  if (stale) {
    console.warn(`[collab] duplicate binding for room "${roomName}" — releasing the stale one first`)
    stale()
  }

  let released = false
  function release() {
    if (released) return
    released = true
    if (activeRoomBindings.get(roomName) === release) {
      activeRoomBindings.delete(roomName)
    }
    teardown()
  }

  activeRoomBindings.set(roomName, release)
  return release
}
