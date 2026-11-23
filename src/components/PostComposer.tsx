import React, { useRef, useState } from 'react';
import { Film, Globe, Image as ImageIcon, Loader2, Lock, Send, Users, X } from 'lucide-react';
import { compressImageToJpegBase64, readVideoAsBase64 } from '../lib/utils';
import { createPost } from '../lib/zynkoApi';
import { MediaMimeType, PostVisibility, PublicProfile } from '../types/zynko';
import { Avatar } from './MediaRenderer';

interface PendingMedia {
  mimeType: MediaMimeType;
  dataBase64: string;
  previewUrl: string;
}

interface PostComposerProps {
  uid: string;
  profile: PublicProfile | null;
  fallbackName: string;
  fallbackAvatarUrl: string;
  defaultVisibility: PostVisibility;
  friendIds: string[];
  onPosted?: () => void;
  compact?: boolean;
}

export const PostComposer: React.FC<PostComposerProps> = ({
  uid,
  profile,
  fallbackName,
  fallbackAvatarUrl,
  defaultVisibility,
  friendIds,
  onPosted,
}) => {
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>(defaultVisibility || 'PUBLIC');
  const [mediaItems, setMediaItems] = useState<PendingMedia[]>([]);
  const [processingMedia, setProcessingMedia] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleSelectImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4 - mediaItems.length);
    if (!files.length) return;
    setProcessingMedia(true);
    setError('');
    try {
      const processed: PendingMedia[] = [];
      for (const file of files) {
        const base64 = await compressImageToJpegBase64(file, 1200, 0.78);
        processed.push({
          mimeType: 'image/jpeg',
          dataBase64: base64,
          previewUrl: `data:image/jpeg;base64,${base64}`,
        });
      }
      setMediaItems((prev) => [...prev, ...processed].slice(0, 4));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to process image.');
    } finally {
      setProcessingMedia(false);
      e.target.value = '';
    }
  };

  const handleSelectVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingMedia(true);
    setError('');
    try {
      const base64 = await readVideoAsBase64(file);
      setMediaItems((prev) => [
        ...prev.slice(0, 3),
        {
          mimeType: 'video/mp4',
          dataBase64: base64,
          previewUrl: `data:video/mp4;base64,${base64}`,
        },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to attach video.');
    } finally {
      setProcessingMedia(false);
      e.target.value = '';
    }
  };

  const removeMedia = (idx: number) => {
    setMediaItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caption.trim() && mediaItems.length === 0) return;

    setPosting(true);
    setError('');
    try {
      await createPost({
        authorId: uid,
        authorName: profile?.name || fallbackName || 'Zynko User',
        authorUsername: profile?.username || 'zynko',
        authorAvatarUrl: profile?.avatarUrl || fallbackAvatarUrl || '',
        authorAvatarMediaId: profile?.avatarMediaId || '',
        caption,
        visibility,
        friendIds,
        mediaItems: mediaItems.map(({ mimeType, dataBase64 }) => ({
          mimeType,
          dataBase64,
        })),
      });
      setCaption('');
      setMediaItems([]);
      onPosted?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not publish post.');
    } finally {
      setPosting(false);
    }
  };

  const visIcon =
    visibility === 'PUBLIC' ? (
      <Globe className="w-3.5 h-3.5" />
    ) : visibility === 'FRIENDS' ? (
      <Users className="w-3.5 h-3.5" />
    ) : (
      <Lock className="w-3.5 h-3.5" />
    );

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3"
    >
      <div className="flex gap-3">
        <Avatar
          name={profile?.name || fallbackName}
          avatarUrl={profile?.avatarUrl || fallbackAvatarUrl}
          avatarMediaId={profile?.avatarMediaId}
          size="md"
        />
        <textarea
          rows={2}
          maxLength={4000}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Share something with Zynko..."
          className="flex-1 bg-transparent text-sm sm:text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-none py-1.5"
        />
      </div>

      {mediaItems.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {mediaItems.map((item, idx) => (
            <div
              key={idx}
              className="relative rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
            >
              {item.mimeType === 'video/mp4' ? (
                <video
                  src={item.previewUrl}
                  controls
                  className="w-full h-40 object-cover bg-black"
                />
              ) : (
                <img
                  src={item.previewUrl}
                  alt="Attachment preview"
                  className="w-full h-40 object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => removeMedia(idx)}
                aria-label="Remove media"
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl">
          {error}
        </p>
      )}

      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleSelectImage}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/*"
            onChange={handleSelectVideo}
            className="hidden"
          />

          <button
            type="button"
            disabled={processingMedia || mediaItems.length >= 4}
            onClick={() => imageInputRef.current?.click()}
            className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Photo</span>
          </button>

          <button
            type="button"
            disabled={processingMedia || mediaItems.length >= 4}
            onClick={() => videoInputRef.current?.click()}
            className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Film className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Video</span>
          </button>

          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-zinc-500">
              {visIcon}
            </span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as PostVisibility)}
              aria-label="Post visibility"
              className="min-h-[40px] pl-8 pr-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="PUBLIC">Public</option>
              <option value="FRIENDS">Friends</option>
              <option value="ONLY_ME">Only Me</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={
            posting || processingMedia || (!caption.trim() && mediaItems.length === 0)
          }
          className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
        >
          {posting || processingMedia ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{posting ? 'Posting...' : 'Post'}</span>
        </button>
      </div>
    </form>
  );
};
