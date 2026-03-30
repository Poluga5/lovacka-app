-- ============================================================
-- LOVAČKA APLIKACIJA — Kompletna shema baze podataka
-- Verzija: 1.0 MVP
-- Supabase / PostgreSQL + PostGIS
-- ============================================================

-- PostGIS ekstenzija (za GPS koordinate i poligone lovišta)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. POSTAVKE APLIKACIJE (naziv kluba, logo, konfiguracija)
-- ============================================================
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Defaultne postavke — mijenja se iz admin panela
INSERT INTO app_settings (key, value) VALUES
  ('club_name',        'LD Kuna Osekovo'),
  ('club_subtitle',    'Lovačko društvo'),
  ('club_location',    'Osekovo, Hrvatska'),
  ('primary_color',    '#2D6A4F'),
  ('invitation_limit', '100'),
  ('invitation_ttl_days', '7'),
  ('timezone',         'Europe/Zagreb'),
  ('default_language', 'hr');

-- ============================================================
-- 2. KORISNICI (proširenje Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. GRUPE / LOVIŠTA
-- ============================================================
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  logo_url    TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Jedna defaultna grupa za MVP
INSERT INTO groups (id, name, description)
VALUES (
  uuid_generate_v4(),
  'LD Kuna Osekovo',
  'Lovačko društvo Kuna Osekovo'
);

-- ============================================================
-- 4. ČLANOVI GRUPE (s ulogama)
-- ============================================================
CREATE TYPE member_role AS ENUM ('admin', 'clan', 'gost');

CREATE TABLE group_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       member_role NOT NULL DEFAULT 'clan',
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  invited_by UUID REFERENCES profiles(id),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user  ON group_members(user_id);

-- ============================================================
-- 5. POZIVNICE
-- ============================================================
CREATE TABLE invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role        member_role NOT NULL DEFAULT 'clan',
  email       TEXT,
  created_by  UUID REFERENCES profiles(id),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  used_at     TIMESTAMPTZ,
  used_by     UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invitations_token   ON invitations(token);
CREATE INDEX idx_invitations_group   ON invitations(group_id);

-- ============================================================
-- 6. PODRUČJA / GRANICE LOVIŠTA (GeoJSON poligoni)
-- ============================================================
CREATE TABLE areas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  geom        GEOMETRY(POLYGON, 4326),
  color       TEXT DEFAULT '#2D6A4F',
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_areas_group ON areas(group_id);
CREATE INDEX idx_areas_geom  ON areas USING GIST(geom);

-- ============================================================
-- 7. POI — Points of Interest (čeke, hranilišta, putovi...)
-- ============================================================
CREATE TYPE poi_type AS ENUM (
  'ceka',
  'hraniliste',
  'soliste',
  'kaljuziste',
  'prolaz',
  'kamera',
  'ostalo'
);

CREATE TABLE poi (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  area_id     UUID REFERENCES areas(id) ON DELETE SET NULL,
  type        poi_type NOT NULL DEFAULT 'ceka',
  name        TEXT NOT NULL,
  description TEXT,
  geom        GEOMETRY(POINT, 4326) NOT NULL,
  meta        JSONB DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_poi_group  ON poi(group_id);
CREATE INDEX idx_poi_area   ON poi(area_id);
CREATE INDEX idx_poi_geom   ON poi USING GIST(geom);
CREATE INDEX idx_poi_type   ON poi(type);

-- ============================================================
-- 8. REZERVACIJE ČEKA
-- ============================================================
CREATE TYPE reservation_status AS ENUM ('aktivna', 'otkazana', 'zavrsena');

CREATE TABLE reservations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poi_id      UUID NOT NULL REFERENCES poi(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date_start  TIMESTAMPTZ NOT NULL,
  date_end    TIMESTAMPTZ NOT NULL,
  status      reservation_status NOT NULL DEFAULT 'aktivna',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_period CHECK (date_end > date_start)
);

-- KLJUČNO: sprječava dvostruke rezervacije iste čeke
CREATE UNIQUE INDEX idx_reservations_no_overlap
  ON reservations(poi_id, date_start, date_end)
  WHERE status = 'aktivna';

CREATE INDEX idx_reservations_poi    ON reservations(poi_id);
CREATE INDEX idx_reservations_user   ON reservations(user_id);
CREATE INDEX idx_reservations_group  ON reservations(group_id);
CREATE INDEX idx_reservations_date   ON reservations(date_start, date_end);

-- ============================================================
-- 9. DNEVNIK LOVA
-- ============================================================
CREATE TYPE entry_type AS ENUM ('odstrjel', 'opazanje', 'rad', 'ostalo');

CREATE TABLE entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        entry_type NOT NULL DEFAULT 'odstrjel',
  species     TEXT NOT NULL,
  quantity    INTEGER DEFAULT 1,
  notes       TEXT,
  photos      TEXT[] DEFAULT '{}',
  geom        GEOMETRY(POINT, 4326),
  hunted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weather     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entries_group      ON entries(group_id);
CREATE INDEX idx_entries_user       ON entries(user_id);
CREATE INDEX idx_entries_hunted_at  ON entries(hunted_at DESC);
CREATE INDEX idx_entries_species    ON entries(species);
CREATE INDEX idx_entries_geom       ON entries USING GIST(geom);

-- ============================================================
-- 10. CHAT — Poruke i threadovi
-- ============================================================
CREATE TABLE threads (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL DEFAULT 'group',  -- 'group' | 'poi' | 'entry'
  scope_id    UUID,
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id   UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  attachments TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_thread     ON messages(thread_id);
CREATE INDEX idx_messages_group      ON messages(group_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- ============================================================
-- 11. AKTIVNOSTI / FEED
-- ============================================================
CREATE TABLE activity (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id     UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_table TEXT,
  target_id    UUID,
  meta         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_group      ON activity(group_id);
CREATE INDEX idx_activity_created_at ON activity(created_at DESC);

-- ============================================================
-- 12. PUSH NOTIFIKACIJE (tokeni uređaja)
-- ============================================================
CREATE TABLE device_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   TEXT NOT NULL DEFAULT 'web',  -- 'web' | 'ios' | 'android'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

-- ============================================================
-- 13. ROW LEVEL SECURITY (RLS) — Privatnost i sigurnost
-- ============================================================
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings  ENABLE ROW LEVEL SECURITY;

-- Korisnik vidi samo svoj profil (ili profil članova iste grupe)
CREATE POLICY "profil_vlastiti" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "profil_clanovi_grupe" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT user_id FROM group_members
      WHERE group_id IN (
        SELECT group_id FROM group_members WHERE user_id = auth.uid()
      )
    )
  );

-- Grupe — vidi samo grupe čiji si član
CREATE POLICY "grupe_clanovi" ON groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- Postavke čita svatko tko je autenticiran
CREATE POLICY "postavke_citanje" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Postavke mijenja samo admin
CREATE POLICY "postavke_admin" ON app_settings
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM group_members WHERE role = 'admin'
    )
  );

-- Generički policy za sve tablice s group_id:
-- Čitanje: svi članovi grupe
-- Pisanje: admin i clan (ne gost)

CREATE POLICY "areas_citanje" ON areas
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "areas_pisanje" ON areas
  FOR ALL USING (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'clan')
    )
  );

CREATE POLICY "poi_citanje" ON poi
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "poi_pisanje" ON poi
  FOR ALL USING (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'clan')
    )
  );

CREATE POLICY "rezervacije_citanje" ON reservations
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "rezervacije_pisanje" ON reservations
  FOR ALL USING (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'clan')
    )
  );

CREATE POLICY "unosi_citanje" ON entries
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "unosi_pisanje" ON entries
  FOR ALL USING (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'clan')
    )
  );

CREATE POLICY "poruke_citanje" ON messages
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );
CREATE POLICY "poruke_pisanje" ON messages
  FOR INSERT WITH CHECK (
    group_id IN (
      SELECT group_id FROM group_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'clan')
    )
  );

CREATE POLICY "aktivnost_citanje" ON activity
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- 14. FUNKCIJA: automatski kreira profil nakon registracije
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 15. FUNKCIJA: log aktivnosti (automatski poziva se iz app-a)
-- ============================================================
CREATE OR REPLACE FUNCTION log_activity(
  p_group_id    UUID,
  p_actor_id    UUID,
  p_action      TEXT,
  p_target_table TEXT DEFAULT NULL,
  p_target_id   UUID DEFAULT NULL,
  p_meta        JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO activity (group_id, actor_id, action, target_table, target_id, meta)
  VALUES (p_group_id, p_actor_id, p_action, p_target_table, p_target_id, p_meta)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- GOTOVO! Baza je spremna.
-- ============================================================
