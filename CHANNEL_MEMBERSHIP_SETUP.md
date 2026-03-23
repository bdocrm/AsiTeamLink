# Channel Membership & Access Control Setup Guide

## Overview
This feature enables **managers to create channels and allocate specific members** to them. Members can only see and access channels they've been invited to.

## ✅ What Was Created

### 1. **Database Migration** (`supabase-channel-membership.sql`)
- `channel_members` table: Links users to channels with roles (owner/moderator/member)
- Updated RLS policies: Users can only see channels they're members of
- RPC functions for secure channel management
- Automatic enforcement via database policies

### 2. **React Component** (`CreateChannelModal.tsx`)
- Beautiful modal for creating channels
- Member selection interface (checkbox list)
- Real-time member count display
- Error/success feedback
- Loading states

### 3. **RPC Functions** (Database)
- `create_channel_with_members()` - Create channel + add multiple members at once
- `add_channel_member()` - Add member to existing channel
- `remove_channel_member()` - Remove member (with owner protection)
- `get_channel_members()` - List all members of a channel
- `get_my_channels()` - Get user's channels only

## 🚀 Setup Steps

### Step 1: Run the SQL Migration
1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy entire contents of `supabase-channel-membership.sql`
3. Paste and execute
4. Wait for success message ✅

### Step 2: Update Sidebar to Use Member Channels
In `src/components/chat/Sidebar.tsx`, update the `fetchChannels` function:

```typescript
const fetchChannels = async () => {
  // Fetch only channels user is a member of
  let result = await supabase.rpc('get_my_channels');
  if (result.error) {
    console.warn('RPC failed:', result.error);
    result = await supabase.from('channels').select('*');
  }
  const data = result.data;
  if (data) {
    setChannels(data);
    // Auto-expand user's campaign
    if (user?.campaign_id) {
      setExpandedCampaigns(prev => new Set(prev).add(user.campaign_id!));
    }
  }
};
```

### Step 3: Add "Create Channel" Button to Sidebar
In Sidebar.tsx, add the modal:

```typescript
import { CreateChannelModal } from './CreateChannelModal';

export function Sidebar({ ... }: SidebarProps) {
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [selectedCampaignForCreate, setSelectedCampaignForCreate] = useState('');

  // In the campaign header, add a button:
  <button
    onClick={() => {
      setSelectedCampaignForCreate(campaign.id);
      setShowCreateChannel(true);
    }}
    title="Create channel"
    className="..."
  >
    <Plus className="w-4 h-4" />
  </button>

  // Add the modal component:
  <CreateChannelModal
    isOpen={showCreateChannel}
    campaignId={selectedCampaignForCreate}
    onClose={() => setShowCreateChannel(false)}
    onChannelCreated={() => fetchChannels()}
  />
}
```

## 🔐 How Access Control Works

### Before (Old Policy)
```
User sees all channels in their campaign
```

### After (New Policy)
```
User sees ONLY channels they're members of
  ↓
Manager creates "Q1 Planning" and adds: [John, Sarah, Mike]
  ↓
- John, Sarah, Mike: Can see "Q1 Planning" ✅
- Other users: Cannot see "Q1 Planning" ❌
- Other channels: Cannot access if not a member ❌
```

## 📊 Data Structure

### channel_members Table
```
id (uuid) - Primary key
channel_id (uuid) - Foreign key to channels
user_id (uuid) - Foreign key to users
role (varchar) - 'owner' | 'moderator' | 'member'
invited_by (uuid) - Who invited them
joined_at (timestamp) - When they joined
```

### Example Flow
1. Manager creates channel "Daily Standup"
2. Manager selects: John, Sarah, Mike
3. System:
   - Creates channel row
   - Creates 4 channel_member rows (manager as owner + 3 members)
   - RLS policies automatically restrict visibility
4. Result:
   - John, Sarah, Mike see "Daily Standup" in sidebar
   - Others don't see it at all
   - Messages in that channel are only visible to members

## 🎯 Manager Capabilities

Only users with `role = 'manager'` or `role = 'admin'` can:
- ✅ Create channels
- ✅ Add/remove members
- ✅ Manage channel settings

Regular agents:
- ✅ View channels they're in
- ✅ Send messages
- ✅ ❌ Cannot create channels
- ❌ Cannot access channels they're not in

## 📝 Email Approval Flow (Future Enhancement)

When implemented, the flow would be:
```
1. Manager sends email requesting channel approval
2. Admin reviews in UI
3. Admin approves → Manager can create channel
4. Manager allocates members
5. Members get notified
6. Channel appears in their sidebar
```

## ✨ UI Components Ready to Use

### CreateChannelModal
- Import: `import { CreateChannelModal } from '@/components/chat/CreateChannelModal'`
- Props:
  - `isOpen: boolean` - Show/hide modal
  - `campaignId: string` - Campaign to create channel in
  - `onClose: () => void` - Handler when closed
  - `onChannelCreated: (name: string) => void` - Handler after creation

## 🐛 Testing

1. **Test Manager Creating Channel:**
   - Log in as manager
   - Open channel creation modal
   - Add members
   - Verify members see channel in sidebar

2. **Test Member Access:**
   - Log in as agent not in channel
   - Verify channel doesn't appear
   - Try accessing directly → should be blocked

3. **Test Compliance:**
   - Member leaves campaign
   - Should not see channels anymore
   - Try accessing → RLS blocks it

## 📚 Files Modified/Created

- ✅ `supabase-channel-membership.sql` - Database migration
- ✅ `src/components/chat/CreateChannelModal.tsx` - New component
- 📝 `src/components/chat/Sidebar.tsx` - Update fetchChannels + add button
- 📝 `src/components/chat/ChatArea.tsx` - Optional: Show member list in channel

## 🔗 Related Files

- [supabase-channel-membership.sql](../supabase-channel-membership.sql)
- [CreateChannelModal.tsx](../src/components/chat/CreateChannelModal.tsx)
- [Sidebar.tsx](../src/components/chat/Sidebar.tsx)
