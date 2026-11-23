import React from 'react';
import { Bell, CheckCheck, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';
import { markNotificationRead } from '../lib/zynkoApi';
import { NotificationDoc } from '../types/zynko';
import { Avatar } from './MediaRenderer';

interface NotificationsViewProps {
  notifications: NotificationDoc[];
  onOpenProfile: (uid: string) => void;
  onOpenPost: (postId: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onOpenProfile,
  onOpenPost,
}) => {
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => markNotificationRead(n.id)));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl text-zinc-900 dark:text-zinc-50">
            Notifications
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-100 flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800/70 overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-10 text-center space-y-2 text-zinc-500">
            <Bell className="w-6 h-6 mx-auto text-zinc-400" />
            <p className="text-sm">No notifications yet.</p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon =
              n.type === 'LIKE'
                ? Heart
                : n.type === 'FRIEND_REQUEST' || n.type === 'FRIEND_ACCEPT' || n.type === 'FOLLOW'
                  ? UserPlus
                  : MessageCircle;

            return (
              <button
                key={n.id}
                type="button"
                onClick={async () => {
                  if (!n.read) {
                    await markNotificationRead(n.id);
                  }
                  if (n.postId) {
                    onOpenPost(n.postId);
                  } else if (n.actorId) {
                    onOpenProfile(n.actorId);
                  }
                }}
                className={`w-full p-4 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                  !n.read
                    ? 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                <div className="relative shrink-0">
                  <Avatar
                    name={n.actorName || 'Zynko'}
                    avatarUrl={n.actorAvatarUrl}
                    avatarMediaId={n.actorAvatarMediaId}
                    size="md"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                    <Icon className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-snug">
                    {n.message || `${n.actorName || 'Someone'} interacted with you.`}
                  </p>
                  <span className="text-xs text-zinc-400 mt-0.5 block">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>

                {!n.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
