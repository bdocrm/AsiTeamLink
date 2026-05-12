-- =============================================================================
-- DATABASE TRIGGER: Auto-capture message deletions into deletion_audit_logs
-- Run this in Supabase SQL Editor AFTER running supabase-audit-complete-setup.sql
-- =============================================================================

-- 1. Function that fires when a message is soft-deleted (is_deleted = true)
CREATE OR REPLACE FUNCTION public.fn_log_message_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when message is being marked as deleted (is_deleted going true)
  IF NEW.is_deleted = true AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false) THEN
    INSERT INTO public.deletion_audit_logs (
      user_id,
      entity_type,
      entity_id,
      entity_name,
      reason,
      permanent,
      deleted_at
    ) VALUES (
      COALESCE(NEW.deleted_by, NEW.sender_id),  -- who deleted it
      'message',
      NEW.id::text,
      COALESCE(LEFT(OLD.text, 100), '[attachment]'),  -- old content before deletion
      'Soft deleted by user',
      false,
      COALESCE(NEW.deleted_at, NOW())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to messages table (fires AFTER update)
DROP TRIGGER IF EXISTS trg_log_message_soft_delete ON public.messages;

CREATE TRIGGER trg_log_message_soft_delete
  AFTER UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_message_soft_delete();

-- 3. Function that fires when a message is permanently deleted (hard delete)
CREATE OR REPLACE FUNCTION public.fn_log_message_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if the message wasn't already soft-deleted (avoid double logging)
  IF OLD.is_deleted = false OR OLD.is_deleted IS NULL THEN
    INSERT INTO public.deletion_audit_logs (
      user_id,
      entity_type,
      entity_id,
      entity_name,
      reason,
      permanent,
      deleted_at
    ) VALUES (
      OLD.sender_id,  -- original sender (deleted_by may not be set for hard deletes)
      'message',
      OLD.id::text,
      COALESCE(LEFT(OLD.text, 100), '[attachment]'),
      'Permanently deleted',
      true,
      NOW()
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach hard delete trigger
DROP TRIGGER IF EXISTS trg_log_message_hard_delete ON public.messages;

CREATE TRIGGER trg_log_message_hard_delete
  AFTER DELETE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_message_hard_delete();

-- 5. Verify triggers were created
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'messages'
ORDER BY trigger_name;

-- =============================================================================
-- HOW IT WORKS:
-- - Soft delete: when is_deleted is set to true, auto-logs to deletion_audit_logs
-- - Hard delete: when a message row is deleted, auto-logs to deletion_audit_logs
-- - No client-side code required - happens at database level
-- =============================================================================

-- 6. Test by checking existing soft-deleted messages (backfill)
-- Uncomment to backfill existing soft-deleted messages:
-- INSERT INTO public.deletion_audit_logs (user_id, entity_type, entity_id, entity_name, reason, permanent, deleted_at)
-- SELECT 
--   COALESCE(deleted_by, sender_id),
--   'message',
--   id::text,
--   '[deleted - backfill]',
--   'Soft deleted (backfilled)',
--   false,
--   COALESCE(deleted_at, created_at)
-- FROM public.messages
-- WHERE is_deleted = true
-- ON CONFLICT DO NOTHING;
