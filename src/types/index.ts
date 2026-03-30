export type UserRole = 'admin' | 'clan' | 'gost'
export type POIType = 'ceka' | 'hraniliste' | 'soliste' | 'kaljuziste' | 'prolaz' | 'kamera' | 'ostalo'
export type EntryType = 'odstrjel' | 'opazanje' | 'rad' | 'ostalo'
export type ReservationStatus = 'aktivna' | 'otkazana' | 'zavrsena'

export interface Profile {
  id: string
  email: string
  full_name: string
  phone?: string
  avatar_url?: string
}

export interface POI {
  id: string
  group_id: string
  type: POIType
  name: string
  description?: string
  geom: any
  is_active: boolean
  created_at: string
}

export interface Reservation {
  id: string
  poi_id: string
  group_id: string
  user_id: string
  date_start: string
  date_end: string
  status: ReservationStatus
  notes?: string
  created_at: string
  poi?: POI
  profiles?: Profile
}

export interface Entry {
  id: string
  group_id: string
  user_id: string
  type: EntryType
  species: string
  quantity: number
  notes?: string
  photos: string[]
  hunted_at: string
  created_at: string
  profiles?: Profile
}

export interface Message {
  id: string
  thread_id: string
  group_id: string
  author_id: string
  body: string
  created_at: string
  profiles?: Profile
}

export interface Activity {
  id: string
  group_id: string
  actor_id: string
  action: string
  meta?: Record<string, unknown>
  created_at: string
  profiles?: Profile
}
