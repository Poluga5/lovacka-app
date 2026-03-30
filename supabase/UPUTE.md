# Upute: Kako postaviti bazu podataka (5 minuta)

## Korak 1 — Idi na Supabase
1. Otvori: https://supabase.com
2. Klikni "Sign Up" → registriraj se s Google računom ili emailom
3. Klikni "New Project"
4. Ispuni:
   - Organization: tvoje ime
   - Name: lovacka-app
   - Database Password: odaberi jaku lozinku (ZAPAMTI JE!)
   - Region: West EU (London) — najbliže HR
5. Klikni "Create new project" i pričekaj 2-3 minute

## Korak 2 — Pokreni SQL shemu
1. U lijevom izborniku klikni "SQL Editor"
2. Klikni "New query"
3. Otvori datoteku: schema.sql
4. Selektiraj sav tekst (Ctrl+A)
5. Kopiraj (Ctrl+C)
6. Zalijepi u SQL Editor (Ctrl+V)
7. Klikni "Run" (zeleni gumb)
8. Trebao bi vidjeti: "Success. No rows returned"

## Korak 3 — Provjeri je li sve OK
1. U lijevom izborniku klikni "Table Editor"
2. Trebao bi vidjeti tablice: profiles, groups, poi, reservations, entries...
3. Ako vidiš tablice — USPJEŠNO!

## Korak 4 — Dohvati API ključeve (trebat će nam)
1. Klikni "Settings" (zupčanik, lijevo dno)
2. Klikni "API"
3. Zapamti/kopiraj:
   - Project URL: https://xxxxx.supabase.co
   - anon public key: eyJhbGciOiJ...

To su tvoji tajni ključevi — šalji ih samo meni!

