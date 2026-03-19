# AsiTeamLink - Internal Group Chat System

A full-stack real-time group chat system built for BPO companies using **Next.js** and **Supabase**.

## Features

- Real-time messaging with Supabase Realtime
- File attachments (images, PDFs, documents) up to 25MB
- Role-based access: Admin, Manager, Team Leader, Agent
- Campaign-based isolation
- Online/offline tracking with Supabase Presence
- Light/Dark theme with system preference detection
- Admin panel for user approval, role assignment, campaign management
- Channel management by Admin, Manager, and TL

## Setup

### 1. Supabase Project

1. Create a project at supabase.com
2. Run `supabase-schema.sql` in the SQL Editor
3. Create a storage bucket named `attachments` (set to public)
4. Add storage policies for authenticated uploads and public reads

### 2. Environment Variables

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run

```bash
npm install
npm run dev
```

### 4. Create Admin

Register an account, then in Supabase Table Editor set the user's `status` to `approved` and `role` to `admin`.
