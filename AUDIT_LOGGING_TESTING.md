# Audit Logging - Complete Testing Guide

## ✅ Setup Complete!

I've created a new audit logging system that uses dedicated API endpoints for reliable logging. Here's how to test it:

---

## **STEP 1: Run Database Setup** 

Go to **Supabase Dashboard** → **SQL Editor** and run:

📄 **`supabase-audit-complete-setup.sql`**

You should see:
```
Setup Complete!
deletion_logs_count | file_logs_count
0                   | 0
```

---

## **STEP 2: Test Deletion Logging**

### Delete a Soft Message (Regular User)
1. Go to `http://localhost:3000/chat`
2. Pick a channel (e.g., "test channel" or "BUSINESS DEVELOPMENT TEST CHAT")
3. Send a message: "test message"
4. **Right-click the message** → Click **Delete**
5. **Check browser console** for:
   ```
   [AUDIT] Soft deletion logged: {...}
   ```

### Verify in Supabase
```sql
SELECT * FROM public.deletion_audit_logs 
WHERE entity_type = 'message' 
ORDER BY created_at DESC LIMIT 5;
```

Should show your deleted message with:
- `entity_type: 'message'`
- `permanent: false`
- `reason: 'Soft deleted by user'`

---

## **STEP 3: Test File Operations**

### Upload a File
1. In the same channel, click **📎 (paperclip icon)**
2. Select any file and upload it
3. **Check browser console** for:
   ```
   [AUDIT] File upload logged: {...}
   ```

### Verify Upload Logging
```sql
SELECT * FROM public.file_audit_logs 
WHERE action = 'upload' 
ORDER BY created_at DESC LIMIT 5;
```

Should show your upload with:
- `action: 'upload'`
- `status: 'success'`
- `file_name: [your file name]`

### Download the File
1. Click **Files** button in channel header
2. Click **Download** icon on your file
3. **Check browser console** for:
   ```
   [AUDIT] File download logged: {...}
   ```

### Verify Download Logging
```sql
SELECT * FROM public.file_audit_logs 
WHERE action = 'download' 
ORDER BY created_at DESC LIMIT 5;
```

### Delete the File
1. In the Files dialog, click **Delete** (trash icon)
2. Confirm deletion
3. **Check browser console** for:
   ```
   [AUDIT] File deletion logged: {...}
   [AUDIT] Deletion logged: {...}
   ```

---

## **STEP 4: View in Compliance Dashboard**

Go to: `http://localhost:3000/chat/compliance`

You should now see:

### **Deleted Messages Tab**
- Shows all soft-deleted messages
- Filters by channel
- Shows who deleted, what, and when

### **File Attachments Tab**
- Shows all uploads, downloads, and deletions
- Statistics dashboard with counts
- Can filter by action type

### **Login Activity Tab**
- Shows login attempts (existing feature)

---

## **Troubleshooting**

### Issue: Still showing "0 deleted messages" or "No file operations"

**Solution 1: Check browser console for [AUDIT] messages**
- Open DevTools (F12)
- Go to Console tab
- Perform an action (delete a message)
- Look for messages starting with `[AUDIT]`

If you see red error messages, that's the issue - copy and share them.

**Solution 2: Verify tables exist**
```sql
-- Run in Supabase SQL Editor
SELECT COUNT(*) FROM public.deletion_audit_logs;
SELECT COUNT(*) FROM public.file_audit_logs;
```

Both should return: `{ "0": 0 }`

**Solution 3: Check user is admin**
```sql
SELECT id, email, role FROM public.users WHERE role = 'admin';
```

Your current user must have `role = 'admin'` to see compliance data.

**Solution 4: Check RLS Policies**
```sql
SELECT * FROM pg_policies 
WHERE tablename IN ('deletion_audit_logs', 'file_audit_logs');
```

Should show policies for both INSERT and SELECT.

---

## **API Endpoints Created**

### 1. Log Deletion
```
POST /api/compliance/log-deletion
```
Body:
```json
{
  "entityType": "message|channel|file",
  "entityId": "id-here",
  "entityName": "optional name",
  "reason": "optional reason",
  "permanent": true/false
}
```

### 2. Log File Operation
```
POST /api/compliance/log-file-operation
```
Body:
```json
{
  "action": "upload|download|delete|view",
  "fileName": "file.txt",
  "fileSize": 1024,
  "fileType": "text/plain",
  "channelId": "optional-channel-id",
  "status": "success|failed",
  "errorMessage": "optional error"
}
```

### 3. Get Deletion Logs (Admin only)
```
GET /api/compliance/deletion-audit?startDate=2024-01-01&endDate=2024-12-31&entityType=message
```

### 4. Get File Logs (Admin only)
```
GET /api/compliance/file-audit?startDate=2024-01-01&endDate=2024-12-31&action=upload
```

---

## **Browser Console Output Examples**

### ✅ Successful Deletion Log
```
[AUDIT] Soft deletion logged: {
  success: true,
  data: [{
    id: "...",
    user_id: "...",
    entity_type: "message",
    entity_id: "...",
    entity_name: "test message...",
    reason: "Soft deleted by user",
    permanent: false,
    created_at: "2026-05-12T..."
  }]
}
```

### ✅ Successful File Upload Log
```
[AUDIT] File upload logged: {
  success: true,
  data: [{
    id: "...",
    user_id: "...",
    file_name: "document.pdf",
    file_size: 245000,
    file_type: "application/pdf",
    action: "upload",
    channel_id: "...",
    status: "success",
    created_at: "2026-05-12T..."
  }]
}
```

---

## **Expected Workflow**

1. User deletes message → `[AUDIT] Soft deletion logged...`
2. You go to `/chat/compliance` → See deletion in "Deleted Messages" tab
3. User uploads file → `[AUDIT] File upload logged...`
4. User downloads file → `[AUDIT] File download logged...`
5. You go to `/chat/compliance` → See all in "File Attachments" tab

---

## **Quick Query to See All Logs**

```sql
-- All deletions (last 20)
SELECT entity_type, entity_name, reason, permanent, created_at, users.email
FROM public.deletion_audit_logs
LEFT JOIN public.users ON deletion_audit_logs.user_id = users.id
ORDER BY created_at DESC
LIMIT 20;

-- All file operations (last 20)
SELECT action, file_name, file_size, status, created_at, users.email
FROM public.file_audit_logs
LEFT JOIN public.users ON file_audit_logs.user_id = users.id
ORDER BY created_at DESC
LIMIT 20;
```

---

## **Need Help?**

1. Check `/chat/compliance` page loads without errors
2. Check browser console for `[AUDIT]` prefixed messages
3. Verify you're logged in as an admin user
4. Run the setup SQL script again if tables seem missing
