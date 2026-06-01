# Admin Panel

A minimalist dark-mode admin panel for your Supabase backend.

## Tables managed
- **Profiles** — users & technicians (CRUD + search + role filter)
- **Bookings** — service bookings (CRUD + status filter + detail view)
- **Locations** — saved addresses with inline Google Maps preview
- **Availability** — technician schedule slots (toggle available/unavailable)
- **Technician Locations** — live location tracking with inline maps

## Setup

1. Copy `.env.example` to `.env` and fill in your keys (already done for you)
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev`
4. Build for production: `npm run build`

## Keys (.env)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_SERVICE_ROLE_KEY=   ← used for full admin access
VITE_GOOGLE_MAPS_API_KEY=         ← for inline map previews
```

> **Note**: The service role key bypasses RLS. Keep this panel private/authenticated.
