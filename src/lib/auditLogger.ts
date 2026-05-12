import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';

export async function logDeletion(
  supabase: any,
  userId: string,
  entityType: 'message' | 'channel' | 'file',
  entityId: string,
  entityName?: string,
  reason?: string,
  permanent: boolean = true
) {
  try {
    console.log('[AUDIT LOG] Logging deletion:', { userId, entityType, entityId, entityName, reason, permanent });
    
    const { data, error } = await supabase.from('deletion_audit_logs').insert({
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      reason,
      permanent,
      deleted_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[AUDIT LOG] Deletion log error:', error);
      throw error;
    }

    console.log('[AUDIT LOG] Deletion logged successfully:', data);
  } catch (err) {
    console.error('[AUDIT LOG] Failed to log deletion:', err);
    // Don't throw - logging shouldn't break the operation
  }
}

export async function logFileOperation(
  supabase: any,
  userId: string,
  action: 'upload' | 'download' | 'view' | 'delete',
  fileName: string,
  fileSize: number,
  fileType?: string,
  channelId?: string,
  ipAddress?: string,
  status: 'success' | 'failed' = 'success',
  errorMessage?: string
) {
  try {
    console.log('[AUDIT LOG] Logging file operation:', { userId, action, fileName, fileSize, fileType, status });
    
    const { data, error } = await supabase.from('file_audit_logs').insert({
      user_id: userId,
      file_name: fileName,
      file_size: fileSize,
      file_type: fileType,
      action,
      channel_id: channelId,
      ip_address: ipAddress,
      status,
      error_message: errorMessage,
    });

    if (error) {
      console.error('[AUDIT LOG] File operation log error:', error);
      throw error;
    }

    console.log('[AUDIT LOG] File operation logged successfully:', data);
  } catch (err) {
    console.error('[AUDIT LOG] Failed to log file operation:', err);
    // Don't throw - logging shouldn't break the operation
  }
}

export function getClientIpAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const ip = request.headers.get('x-real-ip');
  if (ip) return ip;
  return request.ip || 'unknown';
}
