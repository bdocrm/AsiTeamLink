import crypto from 'crypto';

/**
 * Parse device name from User-Agent string
 * Examples: "Chrome (Windows)", "Safari (iPhone)", "Firefox (Mac)"
 */
export function parseDeviceName(userAgent: string): string {
  if (!userAgent) return 'Unknown Device';

  // Browser detection
  let browser = 'Unknown';
  if (userAgent.includes('Chrome') && !userAgent.includes('Chromium')) browser = 'Chrome';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera';

  // OS detection
  let os = 'Unknown';
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac')) os = 'Mac';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('Linux')) os = 'Linux';

  return `${browser} (${os})`;
}

/**
 * Create device hash from IP + User-Agent for comparison
 * Used to identify trusted devices across sessions
 */
export function createDeviceHash(ipAddress: string, userAgent: string): string {
  const combined = `${ipAddress}:${userAgent}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Extract client IP from request headers
 * Handles proxies and various configurations
 */
export function extractClientIp(request: any): string {
  // Try common headers first (Vercel, Cloudflare, etc)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback
  return request.headers.get('cf-connecting-ip') || request.socket?.remoteAddress || 'unknown';
}

/**
 * Format device info for display
 */
export function formatDeviceInfo(session: any): string {
  return `${session.device_name || 'Unknown'} at ${session.ip_address || 'Unknown IP'}`;
}

/**
 * Check if session is still valid (not too old)
 * Default trust window: 30 days
 */
export function isSessionValid(lastActivityAt: string, trustDaysWindow: number = 30): boolean {
  const lastActivity = new Date(lastActivityAt);
  const now = new Date();
  const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceActivity < trustDaysWindow;
}
