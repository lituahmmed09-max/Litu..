import { User } from 'firebase/auth';
import { OWNER_EMAIL, TimestampLike } from '../types/zynko';

export function isStealthOwner(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.email?.toLowerCase() === OWNER_EMAIL && user.emailVerified === true;
}

export function toMillis(ts: TimestampLike): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts === 'object') {
    if (typeof ts.toMillis === 'function') {
      return ts.toMillis();
    }
    if (typeof ts.seconds === 'number') {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1_000_000);
    }
  }
  return 0;
}

export function formatRelativeTime(ts: TimestampLike): string {
  const ms = toMillis(ts);
  if (!ms) return 'Just now';
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function pairId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export function getOrCreateWebDeviceInfo(): { deviceId: string; deviceModel: string } {
  const storageKey = 'zynko_web_device_id';
  let deviceId = '';
  try {
    deviceId = localStorage.getItem(storageKey) || '';
    if (!deviceId) {
      const randomPart =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      deviceId = `web_${randomPart}`;
      localStorage.setItem(storageKey, deviceId);
    }
  } catch {
    deviceId = 'web_ephemeral_browser';
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  let os = 'Web';
  if (/iPhone/.test(ua)) os = 'iPhone';
  else if (/iPad/.test(ua)) os = 'iPad';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Linux/.test(ua)) os = 'Linux';

  return { deviceId, deviceModel: `${browser} on ${os}` };
}

export async function compressImageToJpegBase64(
  file: File,
  maxDimension = 1200,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let currentQuality = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
        // Ensure Base64 stays safely below Firestore 1MB doc limit (~680KB base64)
        while (dataUrl.length > 720_000 && currentQuality > 0.35) {
          currentQuality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
        }
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function readVideoAsBase64(file: File): Promise<string> {
  // Firestore documents have a strict 1 MiB limit; Base64 adds ~33% overhead.
  const MAX_RAW_BYTES = 680 * 1024;
  if (file.size > MAX_RAW_BYTES) {
    throw new Error(
      `Video is ${(file.size / 1024).toFixed(0)} KB. Maximum supported size for direct Firestore sharing is 680 KB.`
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read video file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export function normalizeUsername(input: string): string {
  return input.replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30);
}
