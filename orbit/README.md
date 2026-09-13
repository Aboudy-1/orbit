# Orbit

A social study tool for students — synchronized focus sessions, live statuses, and break-only chat.

## Features

- **Profiles & usernames** — onboarding flow, searchable usernames
- **Friends** — search, send/accept/decline requests, see live status
- **Focus sessions** — host sets focus/break lengths; shared countdown synced via Supabase Realtime
- **Break-only chat** — messaging unlocked only during break phase (enforced in UI + RLS)
- **Live statuses** — Available, Studying, On Break, Away (auto-updated during sessions)

## Stack

- React + Vite + TypeScript
- Supabase (auth, database, realtime)
- Tailwind CSS v4
- React Router v6

## Setup

### 1. App

```bash
cd lockin
npm install
cp .env.example .env   # Windows: copy .env.example .env
```

Add your Supabase URL and anon key to `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

```bash
npm run dev
```

### 2. Supabase database

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **SQL Editor**
2. Paste and run the full contents of [`supabase/schema.sql`](supabase/schema.sql)
3. If realtime tables fail to add (already in publication), enable manually under **Database → Replication** for:
   - `profiles`, `focus_sessions`, `session_participants`, `session_messages`, `friend_requests`, `friendships`

### 3. Auth

- **Authentication → Providers → Email** — enabled
- For local dev: disable **Confirm email** or confirm users in the dashboard

## Usage flow

1. Sign up / log in → choose a **username**
2. **Friends** — search usernames, send requests, accept incoming
3. **Create Session** on the dashboard (focus + break minutes)
4. Host clicks **Start focus** — all participants see the same timer
5. Timer auto-switches focus ↔ break; **chat** works only on breaks
6. Host **End session** — everyone returns to the dashboard

## Project structure

```
src/
  pages/       Auth, Onboarding, Dashboard, Friends, SessionRoom
  components/  UI shell, timer, chat, modals
  hooks/       useAuth, useProfile, useFriends, useFocusSession
  lib/         Supabase client, API helpers, timer math
supabase/
  schema.sql   Tables, RLS, triggers, realtime
```
