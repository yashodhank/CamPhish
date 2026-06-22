import { Session } from '../api/client'

interface Props {
  sessions: Session[]
  value: string
  onChange: (value: string) => void
}

export default function SessionFilter({ sessions, value, onChange }: Props) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="select-apple">
      <option value="">All Sessions</option>
      {sessions.map(s => (
        <option key={s.id} value={s.id}>{s.name || s.id.substring(0, 16)}</option>
      ))}
    </select>
  )
}
