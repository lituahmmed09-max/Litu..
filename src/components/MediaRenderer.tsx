import React, { useEffect, useState } from 'react';
import { Film, ImageOff } from 'lucide-react';
import { getMediaById } from '../lib/mediaCache';
import { MediaDoc } from '../types/zynko';

interface MediaRendererProps {
  mediaId?: string;
  mimeTypeHint?: string;
  alt?: string;
  className?: string;
  onImageClick?: (src: string) => void;
}

function buildDataUri(mimeType: string, dataBase64: string): string {
  if (!dataBase64) return '';
  if (dataBase64.startsWith('data:')) return dataBase64;
  return `data:${mimeType};base64,${dataBase64}`;
}

export const MediaRenderer: React.FC<MediaRendererProps> = ({
  mediaId,
  mimeTypeHint,
  alt = 'Post media',
  className = '',
  onImageClick,
}) => {
  const [media, setMedia] = useState<MediaDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(mediaId));
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!mediaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getMediaById(mediaId)
      .then((res) => {
        if (!active) return;
        setMedia(res);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mediaId]);

  if (loading) {
    return (
      <div
        className={`w-full aspect-video rounded-xl bg-zinc-100 dark:bg-zinc-800/80 animate-pulse flex items-center justify-center ${className}`}
      >
        {mimeTypeHint?.startsWith('video') && (
          <Film className="w-6 h-6 text-zinc-400 dark:text-zinc-500" />
        )}
      </div>
    );
  }

  if (error || !media || !media.dataBase64) {
    return (
      <div
        className={`w-full h-44 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1.5 text-zinc-400 dark:text-zinc-500 ${className}`}
      >
        <ImageOff className="w-5 h-5" />
        <span className="text-xs">Media unavailable</span>
      </div>
    );
  }

  const src = buildDataUri(media.mimeType || mimeTypeHint || 'image/jpeg', media.dataBase64);

  if (media.mimeType?.startsWith('video/') || mimeTypeHint?.startsWith('video/')) {
    return (
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className={`w-full max-h-[520px] rounded-xl bg-black object-contain ${className}`}
      />
    );
  }

  if (media.mimeType?.startsWith('audio/') || mimeTypeHint?.startsWith('audio/')) {
    return (
      <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800">
        <audio src={src} controls className="w-full" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onClick={() => onImageClick?.(src)}
      className={`w-full max-h-[540px] object-cover rounded-xl bg-zinc-100 dark:bg-zinc-800 ${
        onImageClick ? 'cursor-zoom-in' : ''
      } ${className}`}
    />
  );
};

interface AvatarProps {
  name?: string;
  avatarUrl?: string;
  avatarMediaId?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  name = 'Zynko User',
  avatarUrl,
  avatarMediaId,
  size = 'md',
  online,
  className = '',
}) => {
  const [mediaSrc, setMediaSrc] = useState<string>('');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setImgFailed(false);
    if (!avatarMediaId) {
      setMediaSrc('');
      return;
    }
    getMediaById(avatarMediaId).then((res) => {
      if (!active || !res?.dataBase64) return;
      setMediaSrc(buildDataUri(res.mimeType || 'image/jpeg', res.dataBase64));
    });
    return () => {
      active = false;
    };
  }, [avatarMediaId]);

  const finalSrc = mediaSrc || avatarUrl || '';
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'Z';

  return (
    <div className={`relative inline-flex shrink-0 ${SIZE_CLASSES[size]} ${className}`}>
      {finalSrc && !imgFailed ? (
        <img
          src={finalSrc}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full rounded-full object-cover bg-zinc-200 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-blue-600/15 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-semibold flex items-center justify-center border border-blue-600/20">
          {initials}
        </div>
      )}
      {online && (
        <span
          title="Online"
          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900"
        />
      )}
    </div>
  );
};
