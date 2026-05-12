# Audit Logging Setup Guide

## Quick Setup Steps

### 1. Create the Audit Tables in Supabase

Go to your Supabase dashboard and run this SQL script in the SQL editor:

**File:** `supabase-audit-tables-setup.sql`

This script will:
- Drop existing tables (for clean setup)
- Create `deletion_audit_logs` table
- Create `file_audit_logs` table
- Set up proper RLS policies
- Create indexes for performance

### 2. Verify the Tables Were Created

In Supabase SQL editor, run:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('deletion_audit_logs', 'file_audit_logs');
```

You should see both tables listed.

### 3. Check API Routes

Make sure these API routes exist:
- `/src/app/api/compliance/deletion-audit/route.ts` ✓
- `/src/app/api/compliance/file-audit/route.ts` ✓

### 4. Test the Logging

After setup, test by:

**A) Delete a Message (Admin)**
1. Go to a channel (e.g., "test channel")
2. Right-click/select a message and delete it
3. Check browser console - look for `[AUDIT LOG]` messages
4. Go to `/chat/compliance` → "Deleted Messages" tab
5. You should see the deleted message logged

**B) Upload a File**
1. Go to a channel
2. Upload a file via the attachment button
3. Check browser console for `[AUDIT LOG] Logging file operation`
4. Go to `/chat/compliance` → "File Attachments" tab
5. You should see the upload logged

**C) Download a File**
1. Open Channel Files (Files button in chat)
2. Download a file
3. Check browser console for `[AUDIT LOG] Logging file operation`
4. The download should appear in "File Attachments" tab

## Troubleshooting

### No deleted messages appearing?

1. **Check if table exists:**
   ```sql
   SELECT COUNT(*) FROM public.deletion_audit_logs;
   ```

2. **Check RLS policies:**
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'deletion_audit_logs';
   ```

3. **Check browser console:**
   - Look for `[AUDIT LOG]` messages
   - Check for errors in red text

4. **Verify user is admin:**
   - Go to Supabase → Users table
   - Check if your user has `role = 'admin'`

### API returns 403 Forbidden?

- User must be an admin
- Check your user's role in the `users` table

### API returns 401 Unauthorized?

- You must be logged in
- Check if session is active

### Tables show error when querying?

- Run the setup SQL script again
- Make sure you have Service Role key in `.env.local`

## Manual Test Query

To manually insert a test deletion log:

```sql
INSERT INTO public.deletion_audit_logs (
  user_id,
  entity_type,
  entity_id,
  entity_name,
  reason,
  permanent,
  deleted_at
) VALUES (
  'your-user-id-here',
  'message',
  'test-message-id',
  'Test message content',
  'Test deletion',
  true,
  NOW()
);

-- Verify it was inserted:
SELECT * FROM public.deletion_audit_logs ORDER BY created_at DESC LIMIT 5;
```

## Environment Variables Needed

Make sure your `.env.local` has:
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## What Gets Logged

### Deletions (deletion_audit_logs)
- Who deleted (user_id)
- What was deleted (entity_type: message/channel/file)
- When (created_at)
- Reason (reason)
- Type of delete (permanent: soft-delete vs hard-delete)

### File Operations (file_audit_logs)
- Who performed the action (user_id)
- Action type: upload, download, view, delete
- File details: name, size, type
- Channel (if applicable)
- IP address
- Success/failure status
- Timestamp

## Accessing the Compliance Dashboard

Navigate to: `http://localhost:3000/chat/compliance`

Tabs available:
- **Login Audits** - Login attempts, MFA, sessions
- **Deleted Messages** - All deleted messages with who/when/why
- **File Attachments** - All file operations (upload/download/delete)

Each tab has:
- Date range filters
- Type filters
- Export to CSV button
- Statistics dashboard (for file operations)

## API Endpoints

### Get Deletion Logs
```
GET /api/compliance/deletion-audit?startDate=2024-01-01&endDate=2024-12-31&entityType=message
```

### Get File Audit Logs
```
GET /api/compliance/file-audit?startDate=2024-01-01&endDate=2024-12-31&action=upload
```

Both return JSON with `logs` array and require admin authentication.

## Console Logs to Watch

When logging is working, you'll see in browser console:
```
[AUDIT LOG] Logging deletion: {...}
[AUDIT LOG] Deletion logged successfully: [...]

[AUDIT LOG] Logging file operation: {...}
[AUDIT LOG] File operation logged successfully: [...]
```

Red errors indicate logging failed - check the error message for details.
