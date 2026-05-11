# Compliance Role Setup

## Overview
Added a new **Compliance** role with limited auditing capabilities for your company chat system. Compliance users can:

✅ **Can Do:**
- Chat and send messages in assigned channels
- View assigned channels
- **View deleted messages** and audit logs
- See who deleted messages and when
- Audit trail of message deletions
- Filter audit logs by channel

❌ **Cannot Do:**
- Access admin panel
- Delete messages (only view deleted ones)
- Create channels
- Manage campaigns
- Manage users
- Approve/reject registrations

## Implementation Details

### 1. New Role Added
- Added `'compliance'` to `UserRole` type in `src/lib/types.ts`
- Available in Admin panel dropdown for user assignment

### 2. Database Changes
- Created `audit_logs` table to track all message deletions
- Automatically logs: who deleted, what message, when, reason
- Created indexes for performance
- Triggers to automatically add compliance users to all channels in their campaign

### 3. API & Functions
- `log_message_deletion()` - logs every message deletion
- `can_view_deleted_messages()` - checks if user can view deleted messages
- `admin_delete_message()` - updated to log deletions

### 4. New Compliance Audit Page
- Location: `/chat/compliance`
- Shows all deleted messages in assigned channels
- Filter by channel
- Displays: deleted message content, who deleted it, when, reason

### 5. UI Updates
- Admin panel now includes "Compliance" role option
- Sidebar shows "Audit" button for compliance users (instead of "Admin")
- Compliance users see audit page instead of admin panel

## Setup Instructions

### 1. Run Database Migration
Execute the SQL in `supabase-compliance-role.sql`:
```bash
# In Supabase SQL Editor or via CLI
```

### 2. Restart Development Server
```bash
npm run dev
```

### 3. Assign Compliance Users
1. Go to Admin Panel (`/chat/admin`)
2. Find user and set role to "Compliance"
3. Compliance user will automatically be added to all channels in their campaign
4. User can now access Audit page

## Usage

### For Compliance User:
1. Navigate to `/chat/compliance` or click "Audit" button in sidebar
2. View all deleted messages
3. Filter by channel to see specific deletion history
4. See who deleted the message and when

### For Admin:
When deleting a message:
- Deletion is automatically logged to `audit_logs` table
- Compliance users with access to that channel can view the deletion
- Original message content is preserved for audit purposes

## Database Schema

### audit_logs Table
```
- id: UUID (primary key)
- action_type: TEXT ('message_deleted', etc)
- user_id: UUID (who performed the action)
- target_user_id: UUID (whose message was affected)
- message_id: UUID (which message)
- channel_id: UUID (which channel)
- old_content: TEXT (original message text)
- reason: TEXT (why it was deleted)
- ip_address: TEXT (optional)
- created_at: TIMESTAMPTZ
```

## Security Notes

⚠️ **Important Security Considerations:**
- Audit logs are disabled for RLS (Row Level Security) to allow proper logging
- Only compliance users can view logs for their assigned channels
- Message content is preserved for audit purposes
- All deletions are tracked with user IDs and timestamps

## Future Enhancements

You could add:
- Export audit logs to CSV/PDF
- Email notifications on deletions
- Restore deleted messages (soft delete already in place)
- Search audit logs by user/date/content
- Compliance dashboard with statistics
