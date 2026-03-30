# Upute za deploy aplikacije — korak po korak

## KORAK 1 — Pokreni SQL shemu u Supabaseu
1. Idi na: https://supabase.com/dashboard/project/dlcehyicarwwbjkluofl/sql/new
2. Otvori datoteku `schema.sql`
3. Selektaj sve (Ctrl+A), kopiraj (Ctrl+C)
4. Zalijepi u SQL editor, klikni **Run**
5. Provjeri: Table Editor trebao bi pokazati tablice

## KORAK 2 — Postavi Admin korisnika
Nakon što pokreneš aplikaciju, registriraj se s tvojim emailom.
Zatim u Supabase → SQL Editor pokreni:

```sql
-- Zamijeni YOUR_USER_ID s tvojim ID-om iz Authentication → Users
INSERT INTO group_members (user_id, group_id, role)
SELECT 
  'YOUR_USER_ID',
  id,
  'admin'
FROM groups LIMIT 1;
```

## KORAK 3 — GitHub (besplatno)
1. Idi na https://github.com i prijavi se
2. Klikni zeleni gumb **"New"** (novi repozitorij)
3. Naziv: `lovacka-app`
4. Ostavi sve defaultno, klikni **"Create repository"**
5. Na sljedećoj stranici klikni **"uploading an existing file"**
6. Prenesi SVE datoteke iz ZIP paketa
7. Klikni **"Commit changes"**

## KORAK 4 — Vercel (besplatno)
1. Idi na https://vercel.com i prijavi se
2. Klikni **"Add New Project"**
3. Odaberi tvoj GitHub repozitorij `lovacka-app`
4. Klikni **"Environment Variables"** i dodaj:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://dlcehyicarwwbjkluofl.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_iWBR1g8CYVFwNDbDb8mEzw_DcuDLoFx`
5. Klikni **"Deploy"**
6. Pričekaj 2-3 minute → dobiveš URL poput `lovacka-app.vercel.app`

## TO JE TO! Aplikacija je live. 🎉

---
## Što aplikacija ima:
- Login / Registracija s pozivnicama
- Dashboard s feedom aktivnosti
- Interaktivna karta (klikni za dodavanje čeka, hranilišta...)
- Rezervacije čeka s kalendarom (anti-kolizija)
- Dnevnik lova s CSV exportom
- Realtime grupni chat
- Admin panel (postavke kluba, upravljanje članovima, pozivnice)

## Naziv kluba se mijenja:
Admin panel → Postavke kluba → Naziv kluba → Spremi
