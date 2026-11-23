import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Film,
  Image as ImageIcon,
  Loader2,
  MessageSquarePlus,
  Send,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  compressImageToJpegBase64,
  formatRelativeTime,
  pairId,
  readVideoAsBase64,
  toMillis,
} from '../lib/utils';
import { sendChatMessage } from '../lib/zynkoApi';
import {
  ConversationDoc,
  MediaMimeType,
  MessageDoc,
  PublicProfile,
} from '../types/zynko';
import { Avatar, MediaRenderer } from './MediaRenderer';

interface MessengerViewProps {
  currentUid: string;
  currentName: string;
  conversations: ConversationDoc[];
  profiles: PublicProfile[];
  initialTargetUid?: string | null;
  onImageClick: (src: string) => void;
}

export const MessengerView: React.FC<MessengerViewProps> = ({
  currentUid,
  currentName,
  conversations,
  profiles,
  initialTargetUid,
  onImageClick,
}) => {
  const [selectedUid, setSelectedUid] = useState<string | null>(
    initialTargetUid || null
  );
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [text, setText] = useState('');
  const [pendingMedia, setPendingMedia] = useState<{
    mimeType: MediaMimeType;
    dataBase64: string;
    previewUrl: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [showNewPicker, setShowNewPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [error, setError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTargetUid) {
      setSelectedUid(initialTargetUid);
    }
  }, [initialTargetUid]);

  const profileMap = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    profiles.forEach((p) => map.set(p.userId, p));
    return map;
  }, [profiles]);

  const activeConvId = selectedUid ? pairId(currentUid, selectedUid) : null;

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'conversations', activeConvId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(150)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: MessageDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MessageDoc, 'id'>),
        }));
        list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
        setMessages(list);
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 60);
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `conversations/${activeConvId}/messages`,
          true
        );
      }
    );
    return () => unsub();
  }, [activeConvId]);

  const handleAttachImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const base64 = await compressImageToJpegBase64(file, 1024, 0.78);
      setPendingMedia({
        mimeType: 'image/jpeg',
        dataBase64: base64,
        previewUrl: `data:image/jpeg;base64,${base64}`,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to attach image.');
    }
    e.target.value = '';
  };

  const handleAttachVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const base64 = await readVideoAsBase64(file);
      setPendingMedia({
        mimeType: 'video/mp4',
        dataBase64: base64,
        previewUrl: `data:video/mp4;base64,${base64}`,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to attach video.');
    }
    e.target.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUid || (!text.trim() && !pendingMedia) || sending) return;
    setSending(true);
    setError('');
    try {
      await sendChatMessage({
        senderUid: currentUid,
        senderName: currentName,
        recipientUid: selectedUid,
        text,
        mediaItem: pendingMedia
          ? {
              mimeType: pendingMedia.mimeType,
              dataBase64: pendingMedia.dataBase64,
            }
          : null,
      });
      setText('');
      setPendingMedia(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const selectedProfile = selectedUid ? profileMap.get(selectedUid) : null;
  const availablePeople = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return profiles.filter(
      (p) =>
        p.userId !== currentUid &&
        p.accountStatus !== 'BANNED' &&
        p.accountStatus !== 'REMOVED' &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.username.toLowerCase().includes(q))
    );
  }, [profiles, currentUid, pickerSearch]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[calc(100vh-11rem)] md:h-[calc(100vh-7.5rem)] min-h-[480px]">
      {/* Left: Conversations List */}
      <div
        className={`md:col-span-5 lg:col-span-4 border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col min-h-0 ${
          selectedUid ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h1 className="font-display font-bold text-lg text-zinc-900 dark:text-zinc-50">
            Messenger
          </h1>
          <button
            type="button"
            onClick={() => setShowNewPicker((v) => !v)}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <MessageSquarePlus className="w-4 h-4" />
            New
          </button>
        </div>

        {showNewPicker && (
          <div className="p-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-2">
            <input
              type="text"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="Pick someone to message..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs"
            />
            <div className="max-h-40 overflow-y-auto space-y-1 zynko-scroll">
              {availablePeople.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => {
                    setSelectedUid(p.userId);
                    setShowNewPicker(false);
                  }}
                  className="w-full px-2.5 py-2 rounded-xl hover:bg-white dark:hover:bg-zinc-800 flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <Avatar
                    name={p.name}
                    avatarUrl={p.avatarUrl}
                    avatarMediaId={p.avatarMediaId}
                    online={p.online}
                    size="xs"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      @{p.username}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto zynko-scroll divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No conversations yet. Tap New to start chatting.
            </div>
          ) : (
            conversations.map((conv) => {
              const otherUid =
                conv.participantIds.find((id) => id !== currentUid) || '';
              const other = profileMap.get(otherUid);
              const isSelected = otherUid === selectedUid;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedUid(otherUid)}
                  className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <Avatar
                    name={other?.name || 'Zynko User'}
                    avatarUrl={other?.avatarUrl}
                    avatarMediaId={other?.avatarMediaId}
                    online={other?.online}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {other?.name || 'Zynko User'}
                      </span>
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        {formatRelativeTime(conv.lastMessageAt || conv.updatedAt)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {conv.lastSenderId === currentUid ? 'You: ' : ''}
                      {conv.lastMessage || 'Start a conversation'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Active Chat Thread */}
      <div
        className={`md:col-span-7 lg:col-span-8 flex flex-col min-h-0 ${
          selectedUid ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!selectedUid ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-sm text-zinc-500">
            Select a conversation or start a new chat.
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedUid(null)}
                aria-label="Back to chats"
                className="md:hidden min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <Avatar
                name={selectedProfile?.name || 'Zynko User'}
                avatarUrl={selectedProfile?.avatarUrl}
                avatarMediaId={selectedProfile?.avatarMediaId}
                online={selectedProfile?.online}
                size="sm"
              />
              <div className="min-w-0">
                <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                  {selectedProfile?.name || 'Zynko User'}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {selectedProfile?.online ? 'Online now' : `@${selectedProfile?.username || 'zynko'}`}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 zynko-scroll bg-zinc-50/50 dark:bg-zinc-950/30">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-zinc-400 py-8">
                  Say hello to {selectedProfile?.name || 'your friend'}!
                </div>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderId === currentUid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[82%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm space-y-2 ${
                          mine
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-900 dark:text-zinc-100 rounded-bl-md'
                        }`}
                      >
                        {msg.mediaId && (
                          <MediaRenderer
                            mediaId={msg.mediaId}
                            mimeTypeHint={msg.mediaType}
                            onImageClick={onImageClick}
                            className="!max-h-60"
                          />
                        )}
                        {msg.text && (
                          <p className="whitespace-pre-wrap break-words leading-relaxed">
                            {msg.text}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 mt-1 px-1">
                        {formatRelativeTime(msg.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {pendingMedia && (
              <div className="px-4 pt-2 flex items-center gap-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {pendingMedia.mimeType === 'video/mp4' ? (
                    <video
                      src={pendingMedia.previewUrl}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={pendingMedia.previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingMedia(null)}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="px-4 py-1.5 text-xs text-red-500">{error}</div>
            )}

            <form
              onSubmit={handleSend}
              className="p-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5"
            >
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                onChange={handleAttachImage}
                className="hidden"
              />
              <input
                ref={vidRef}
                type="file"
                accept="video/mp4,video/*"
                onChange={handleAttachVideo}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => imgRef.current?.click()}
                aria-label="Send photo"
                className="min-h-[42px] min-w-[42px] rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => vidRef.current?.click()}
                aria-label="Send video"
                className="min-h-[42px] min-w-[42px] rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer"
              >
                <Film className="w-5 h-5" />
              </button>
              <input
                type="text"
                maxLength={3000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message..."
                className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={sending || (!text.trim() && !pendingMedia)}
                aria-label="Send message"
                className="min-h-[42px] min-w-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white flex items-center justify-center cursor-pointer"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
