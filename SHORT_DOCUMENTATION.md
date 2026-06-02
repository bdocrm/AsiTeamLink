# AsiTeamLink - Short Documentation

## What It Is
AsiTeamLink is an internal, role-based team chat platform for BPO operations.  
It is built with Next.js + Supabase and supports real-time messaging, channel control, and compliance/audit workflows.

## Core Features
- Real-time team chat with channel-based communication
- Role and approval flow (`admin`, `manager`, `team leader`, `agent`)
- Campaign-based data isolation
- File attachments and media sharing
- Announcements with reactions and read tracking
- Compliance pages for login/file/deletion/channel-rename audits
- Security features: MFA, session checks, adaptive login controls

## Tech Stack
- Frontend: Next.js (App Router), React, TypeScript, Tailwind CSS
- Backend/API: Next.js Route Handlers (`src/app/api/**`)
- Database/Auth/Realtime/Storage: Supabase
- Testing: Vitest

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Set environment variables in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```
3. Initialize DB using the provided SQL files (start with `supabase-schema.sql`, then required migration/fix scripts).
4. Run development server:
```bash
npm run dev
```
5. Open `http://localhost:3000`.

## Main App Areas
- `src/app/login`, `src/app/register` - authentication flows
- `src/app/chat` - main chat workspace
- `src/app/chat/admin` - admin management tools
- `src/app/compliance` and `src/app/api/compliance/*` - audit/compliance operations
- `src/app/api/admin/*` - admin actions (user/channel/security management)

## Useful Commands
- `npm run dev` - start local development
- `npm run build` - production build
- `npm run start` - run production server
- `npm run test` - run tests
- `npm run lint` - lint codebase

## Notes
- Many SQL scripts in root are incremental migrations/fixes; apply in controlled order per environment.
- Keep Supabase RLS policies aligned with role/campaign requirements before production deployment.
