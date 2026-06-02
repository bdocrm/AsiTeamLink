# AsiTeamLink - Full Documentation

## 1. Overview
AsiTeamLink is an internal communication platform for BPO teams, built with Next.js and Supabase. It provides real-time chat, channel management, announcements, user administration, and compliance/audit tooling.

Primary goals:
- Fast internal team communication
- Role-based governance
- Campaign-scoped isolation
- Traceable user and content actions

## 2. Architecture
- Frontend: Next.js App Router + React + TypeScript + Tailwind CSS
- Backend: Next.js Route Handlers under `src/app/api/**`
- Data/Auth/Realtime/Storage: Supabase
- Email: SMTP via Nodemailer
- Testing: Vitest

High-level flow:
1. User authenticates via Supabase auth.
2. App enforces role/status/campaign rules.
3. Chat/announcements/files are read/written through Supabase with RLS.
4. Admin and compliance APIs expose governance and audit operations.

## 3. Tech Stack
- `next@16.1.7`
- `react@19.2.3`
- `typescript@5`
- `@supabase/supabase-js@2.99.2`
- `@supabase/ssr@0.9.0`
- `tailwindcss@4`
- `vitest@1.6.1`

## 4. Repository Structure
```text
AsiTeamLink/
  src/
    app/
      api/                      # Route handlers (server APIs)
      chat/                     # Chat pages (workspace/admin/compliance/settings)
      login/ register/ reset-password/
      compliance/
    components/
      chat/                     # Chat UI modules
      compliance/               # Audit/compliance viewers
      settings/                 # Session/MFA settings
    lib/
      supabase/                 # client/server/admin Supabase clients
      audit/logger/utilities
  public/                       # Static assets
  *.sql                         # Supabase schema/migrations/fixes
  README.md
```

## 5. Roles and Access Model
Observed roles/flows in code:
- `admin`
- `manager`
- `team leader` / `tl` (naming may vary by table values)
- `agent`

Common access behaviors:
- New users can require approval before full use.
- Admin endpoints gate sensitive actions (role updates, channel/user deletion, password operations).
- Campaign/channel membership constraints are reinforced via SQL/RLS and RPC scripts.

## 6. Main Features
- Real-time channel messaging
- File attachments and file audit logging
- Announcements with reactions and read receipts
- GIF search/trending integration (GIPHY)
- Login security: MFA + adaptive login flow
- Admin operations:
  - User approval and role update
  - Channel rename/delete and posting mode changes
  - Password reset and auth diagnostics
- Compliance dashboards:
  - Login audit
  - File audit
  - Deletion audit
  - Suspicious activity
  - Channel rename logs

## 7. API Surface (Route Handlers)
Base path: `/api`

### 7.1 Auth
- `POST /api/auth/register`
- `POST /api/auth/accept-aup`
- `POST /api/auth/mfa`
- `POST /api/auth/adaptive-login`
- `GET|POST /api/auth/sessions`
- `POST /api/auth/request-password-reset`
- `GET /api/auth/callback`

### 7.2 Admin
- `POST /api/admin/approve-user`
- `POST /api/admin/update-role`
- `POST /api/admin/update-channel-posting-mode`
- `POST /api/admin/rename-channel`
- `POST /api/admin/delete-channel`
- `POST /api/admin/delete-message`
- `POST /api/admin/delete-user`
- `POST /api/admin/reset-password`
- `POST /api/admin/reset-password-request`
- `POST /api/admin/set-password`
- `POST /api/admin/recreate-auth-user`
- `GET /api/admin/server-monitor`
- `GET /api/admin/check-rls`
- `POST /api/admin/fix-rls`
- `GET|POST /api/admin/user-auth-diagnostics`
- `POST /api/admin/test-admin-insert`

### 7.3 Announcements
- `GET|POST|PUT|DELETE /api/announcements`
- `POST /api/announcements/mark-read`
- `POST /api/announcements/reactions`

### 7.4 Compliance
- `GET /api/compliance/login-audit`
- `GET /api/compliance/file-audit`
- `GET /api/compliance/deletion-audit`
- `GET /api/compliance/channel-rename-logs`
- `GET /api/compliance/suspicious-activity`
- `POST /api/compliance/log-file-operation`
- `POST /api/compliance/log-deletion`

### 7.5 Utility
- `POST /api/upload`
- `POST /api/send-confirmation`
- `GET /api/language/check`
- `GET /api/client-ip`
- `GET /api/gifs/trending`
- `GET /api/gifs/search`
- `GET /api/hello`

## 8. Environment Variables
Create `.env.local` with values for your environment.

Required core:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Required for privileged server operations:
- `SUPABASE_URL` (recommended explicit server URL)
- `SUPABASE_SERVICE_ROLE_KEY`

Required for email workflows:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USERNAME` (or `SMTP_USER`)
- `SMTP_PASSWORD` (or `SMTP_PASS`)
- `SMTP_FROM_NAME`
- `SMTP_FROM_EMAIL`

Optional:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_NAME`
- `SUPPORT_EMAIL`
- `EMAIL_COOLDOWN_MINUTES`
- `GIPHY_API_KEY`
- `DEV_ADMIN_TEST_TOKEN`

## 9. Database and SQL Scripts
Starting point:
- `supabase-schema.sql`

The repository includes many follow-up SQL files for:
- RLS fixes
- role/compliance setup
- announcements, reactions, reads
- channel membership and governance RPCs
- audit tables and triggers

Recommended approach:
1. Apply `supabase-schema.sql` to a clean project.
2. Apply feature scripts by domain (membership, announcements, compliance).
3. Apply fix/migration scripts in chronological rollout order used by your environment.
4. Validate key admin/compliance APIs after each batch.

## 10. Setup and Run
1. Install:
```bash
npm install
```
2. Configure `.env.local`.
3. Apply required Supabase SQL.
4. Start dev server:
```bash
npm run dev
```
5. Open `http://localhost:3000`.

Production:
```bash
npm run build
npm run start
```

## 11. Testing and Quality
- Run tests:
```bash
npm run test
```
- Lint:
```bash
npm run lint
```

Current test location observed:
- `src/lib/__tests__/grammarUtils.test.ts`

## 12. Security and Compliance Notes
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and never expose to client bundles.
- Ensure RLS is enabled and verified for all sensitive tables.
- Confirm audit logging routes are protected to trusted actors only.
- SMTP failures should degrade gracefully for admin recovery flows (already partially handled in code).
- If secrets were committed or shared, rotate them immediately in Supabase/SMTP providers.

## 13. Known Operational Areas to Monitor
- Auth/session edge cases (approval + role sync + password reset)
- Channel membership consistency across campaigns
- Announcement author/content normalization scripts
- Compliance log completeness for delete/file actions

## 14. Suggested Next Documentation Improvements
- Add an explicit ERD/table dictionary from `supabase-schema.sql`.
- Add endpoint-level request/response contracts with sample payloads.
- Add deployment runbook (Vercel/self-hosted) and rollback checklist.
- Add incident checklist for auth/email/audit failures.
