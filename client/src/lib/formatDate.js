// "Aug 30, 2026 • 4:02 PM" — used anywhere a workspace's createdAt (or any
// other timestamp) needs a compact display, rendered in the viewer's own
// locale and timezone rather than a hardcoded one.
//
// The `Z` guard matters: Postgres TIMESTAMP (no time zone) columns are
// stored and read back as UTC instants (see server/db/index.js), but if a
// value ever reaches here without a trailing "Z" or explicit offset,
// `new Date(...)` parses it as *local* wall-clock time instead of UTC —
// silently mislabeling the instant for every viewer not in UTC.
export function formatLocalDateTime(dateString) {
  if (!dateString) return ''
  const iso = dateString.endsWith('Z') ? dateString : `${dateString}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const datePart = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
  const timePart = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  return `${datePart} • ${timePart}`
}

// "AUG 30, 2026" — the compact, time-free variant used on workspace cards,
// where the label-mono uppercase styling is applied by the caller's CSS but
// the string itself is upper-cased here so it reads correctly even if that
// styling is ever dropped.
export function formatDateOnly(dateString) {
  if (!dateString) return ''
  const iso = dateString.endsWith('Z') ? dateString : `${dateString}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date).toUpperCase()
}
