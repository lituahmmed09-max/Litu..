import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, query } from 'firebase/firestore';
import {
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
  Film,
  Flag,
  Lock,
  Search,
  ShieldAlert,
  Smartphone,
  Star,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatRelativeTime, isStealthOwner, toMillis } from '../lib/utils';
import {
  ownerDeletePost,
  ownerRemoveUserAccount,
  ownerResolveReport,
  ownerSetPostFeatured,
  ownerSetPostModeration,
  ownerSetUserAccountStatus,
} from '../lib/zynkoApi';
import { PostDoc, PublicProfile, ReportDoc, UserDoc } from '../types/zynko';
import { Avatar, MediaRenderer } from './MediaRenderer';

interface StealthOwnerConsoleProps {
  currentUser: User;
  profiles: PublicProfile[];
  posts: PostDoc[];
  onToast: (msg: string) => void;
}

type OwnerTab = 'devices' | 'users' | 'posts' | 'reports';

export const StealthOwnerConsole: React.FC<StealthOwnerConsoleProps> = ({
  currentUser,
  profiles,
  posts,
  onToast,
}) => {
  const [tab, setTab] = useState<OwnerTab>('devices');
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [search, setSearch] = useState('');
  const [postFilter, setPostFilter] = useState<'all' | 'videos' | 'featured' | 'removed'>('all');

  const verifiedOwner = isStealthOwner(currentUser);

  useEffect(() => {
    if (!verifiedOwner) return;

    const unsubUsers = onSnapshot(
      query(collection(db, 'users')),
      (snap) => {
        setUsers(
          snap.docs.map((d) => ({
            userId: d.id,
            ...(d.data() as Omit<UserDoc, 'userId'>),
          }))
        );
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users', true);
      }
    );

    const unsubReports = onSnapshot(
      query(collection(db, 'reports')),
      (snap) => {
        const list: ReportDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReportDoc, 'id'>),
        }));
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setReports(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'reports', true);
      }
    );

    return () => {
      unsubUsers();
      unsubReports();
    };
  }, [verifiedOwner]);

  const profileMap = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    profiles.forEach((p) => map.set(p.userId, p));
    return map;
  }, [profiles]);

  const deviceGroups = useMemo(() => {
    const groups = new Map<
      string,
      { deviceId: string; deviceModel: string; accounts: UserDoc[] }
    >();

    for (const u of users) {
      const key = u.deviceId || 'unknown_device';
      const existing = groups.get(key);
      if (existing) {
        existing.accounts.push(u);
      } else {
        groups.set(key, {
          deviceId: key,
          deviceModel: u.deviceModel || 'Unknown Device',
          accounts: [u],
        });
      }
    }

    const q = search.trim().toLowerCase();
    return Array.from(groups.values())
      .filter((g) => {
        if (!q) return true;
        return (
          g.deviceId.toLowerCase().includes(q) ||
          g.deviceModel.toLowerCase().includes(q) ||
          g.accounts.some((a) => {
            const prof = profileMap.get(a.userId);
            return (
              a.email?.toLowerCase().includes(q) ||
              a.userId.toLowerCase().includes(q) ||
              prof?.name.toLowerCase().includes(q) ||
              prof?.username.toLowerCase().includes(q)
            );
          })
        );
      })
      .sort((a, b) => b.accounts.length - a.accounts.length);
  }, [users, search, profileMap]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!q) return true;
      const prof = profileMap.get(u.userId);
      return (
        u.email?.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q) ||
        u.deviceId?.toLowerCase().includes(q) ||
        prof?.name.toLowerCase().includes(q) ||
        prof?.username.toLowerCase().includes(q)
      );
    });
  }, [users, search, profileMap]);

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (postFilter === 'videos' && !p.mediaTypes?.some((t) => t.startsWith('video'))) {
        return false;
      }
      if (postFilter === 'featured' && !p.featured) return false;
      if (postFilter === 'removed' && p.moderationStatus !== 'REMOVED') return false;
      if (!q) return true;
      return (
        p.caption?.toLowerCase().includes(q) ||
        p.authorName?.toLowerCase().includes(q) ||
        p.authorUsername?.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [posts, postFilter, search]);

  if (!verifiedOwner) return null;

  const multiAccountDevicesCount = deviceGroups.filter(
    (g) => g.accounts.length > 1
  ).length;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-zinc-900 dark:text-zinc-50">
                Owner Control Center
              </h1>
              <p className="text-xs text-zinc-500">
                Verified session · {users.length} accounts · {deviceGroups.length} devices ({multiAccountDevicesCount} multi-account)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-x-auto">
            {(
              [
                { id: 'devices', label: 'Device Groups', icon: Smartphone },
                { id: 'users', label: `Users (${users.length})`, icon: Users },
                { id: 'posts', label: `Posts (${posts.length})`, icon: Film },
                { id: 'reports', label: `Reports (${reports.filter((r) => r.status !== 'RESOLVED').length})`, icon: Flag },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    tab === item.id
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by email, uid, deviceId, device model, username, or caption..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Multi-Account Device Groups */}
      {tab === 'devices' && (
        <div className="space-y-3">
          {deviceGroups.map((group) => {
            const isMulti = group.accounts.length > 1;
            return (
              <div
                key={group.deviceId}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        {group.deviceModel}
                      </span>
                      {isMulti && (
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          · {group.accounts.length} accounts on device
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500 truncate mt-0.5">
                      deviceId: {group.deviceId}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-zinc-500">
                    {group.accounts.length} account{group.accounts.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {group.accounts.map((acc) => {
                    const prof = profileMap.get(acc.userId);
                    return (
                      <div
                        key={acc.userId}
                        className="py-2.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            name={prof?.name || acc.email || 'User'}
                            avatarUrl={prof?.avatarUrl}
                            avatarMediaId={prof?.avatarMediaId}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                              {prof?.name || 'No public profile'}{' '}
                              {prof?.username ? (
                                <span className="text-xs text-zinc-500">
                                  @{prof.username}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-zinc-500 truncate">
                              {acc.email} ·{' '}
                              <span
                                className={
                                  acc.accountStatus === 'ACTIVE'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400 font-medium'
                                }
                              >
                                {acc.accountStatus || 'ACTIVE'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <UserActionButtons
                          currentUser={currentUser}
                          acc={acc}
                          prof={prof}
                          onToast={onToast}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Users Directory */}
      {tab === 'users' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-800">
          {filteredUsers.map((acc) => {
            const prof = profileMap.get(acc.userId);
            return (
              <div
                key={acc.userId}
                className="p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={prof?.name || acc.email || 'User'}
                    avatarUrl={prof?.avatarUrl}
                    avatarMediaId={prof?.avatarMediaId}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                      {prof?.name || acc.email}{' '}
                      {prof?.username && (
                        <span className="text-xs font-normal text-zinc-500">
                          @{prof.username}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {acc.email} · {acc.deviceModel || 'Unknown'} ·{' '}
                      <span
                        className={
                          acc.accountStatus === 'ACTIVE'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400 font-semibold'
                        }
                      >
                        {acc.accountStatus || 'ACTIVE'}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-zinc-400 truncate">
                      uid: {acc.userId}
                    </div>
                  </div>
                </div>

                <UserActionButtons
                  currentUser={currentUser}
                  acc={acc}
                  prof={prof}
                  onToast={onToast}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Posts & Videos Moderation */}
      {tab === 'posts' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
            {(
              [
                { id: 'all', label: 'All Posts' },
                { id: 'videos', label: 'Videos' },
                { id: 'featured', label: 'Featured' },
                { id: 'removed', label: 'Hidden' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPostFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                  postFilter === f.id
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {post.authorName} (@{post.authorUsername})
                  </div>
                  <div className="text-xs text-zinc-500">
                    {formatRelativeTime(post.createdAt)} · {post.visibility} ·{' '}
                    <span
                      className={
                        post.moderationStatus === 'REMOVED'
                          ? 'text-red-500 font-semibold'
                          : 'text-emerald-600'
                      }
                    >
                      {post.moderationStatus || 'ACTIVE'}
                    </span>
                    {post.featured ? ' · Featured' : ''}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await ownerSetPostFeatured(currentUser, post.id, !post.featured);
                      onToast(post.featured ? 'Post unfeatured' : 'Post featured');
                    }}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 cursor-pointer ${
                      post.featured
                        ? 'bg-blue-600 text-white'
                        : 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                    {post.featured ? 'Unfeature' : 'Feature'}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const next =
                        post.moderationStatus === 'REMOVED' ? 'ACTIVE' : 'REMOVED';
                      await ownerSetPostModeration(currentUser, post.id, next);
                      onToast(next === 'REMOVED' ? 'Post hidden' : 'Post restored');
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 cursor-pointer"
                  >
                    {post.moderationStatus === 'REMOVED' ? (
                      <>
                        <Eye className="w-3.5 h-3.5" /> Restore
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" /> Hide
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await ownerDeletePost(currentUser, post.id, post.mediaIds);
                      onToast('Post deleted permanently');
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {post.caption && (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {post.caption}
                </p>
              )}

              {post.mediaIds?.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {post.mediaIds.map((mId, idx) => (
                    <MediaRenderer
                      key={`${mId}_${idx}`}
                      mediaId={mId}
                      mimeTypeHint={post.mediaTypes?.[idx]}
                      className="!max-h-64"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reports Queue */}
      {tab === 'reports' && (
        <div className="space-y-2.5">
          {reports.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center text-sm text-zinc-500">
              No reports submitted.
            </div>
          ) : (
            reports.map((rep) => (
              <div
                key={rep.id}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {rep.targetType}: {rep.reason}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    targetId: {rep.targetId} · reporter: {rep.reporterId} ·{' '}
                    {rep.status || 'PENDING'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {rep.targetType === 'POST' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await ownerSetPostModeration(currentUser, rep.targetId, 'REMOVED');
                        await ownerResolveReport(currentUser, rep.id);
                        onToast('Post hidden and report resolved');
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-medium cursor-pointer"
                    >
                      Hide Post
                    </button>
                  )}
                  {rep.status !== 'RESOLVED' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await ownerResolveReport(currentUser, rep.id);
                        onToast('Report resolved');
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const UserActionButtons: React.FC<{
  currentUser: User;
  acc: UserDoc;
  prof?: PublicProfile;
  onToast: (msg: string) => void;
}> = ({ currentUser, acc, prof, onToast }) => {
  const isSelf = acc.userId === currentUser.uid;
  if (isSelf) {
    return <span className="text-xs text-zinc-400 font-medium">Owner Session</span>;
  }
  const isLocked = acc.accountStatus === 'LOCKED';
  const isBanned = acc.accountStatus === 'BANNED';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={async () => {
          const next = isLocked ? 'ACTIVE' : 'LOCKED';
          await ownerSetUserAccountStatus(currentUser, acc.userId, next);
          onToast(next === 'LOCKED' ? 'Account locked' : 'Account unlocked');
        }}
        className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1 cursor-pointer"
      >
        {isLocked ? (
          <>
            <Unlock className="w-3.5 h-3.5 text-emerald-500" /> Unlock
          </>
        ) : (
          <>
            <Lock className="w-3.5 h-3.5 text-amber-500" /> Lock
          </>
        )}
      </button>

      <button
        type="button"
        onClick={async () => {
          const next = isBanned ? 'ACTIVE' : 'BANNED';
          await ownerSetUserAccountStatus(currentUser, acc.userId, next);
          onToast(next === 'BANNED' ? 'Account banned' : 'Account restored');
        }}
        className={`min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 cursor-pointer ${
          isBanned
            ? 'bg-emerald-600 text-white'
            : 'bg-amber-600/15 text-amber-700 dark:text-amber-300'
        }`}
      >
        <Ban className="w-3.5 h-3.5" />
        {isBanned ? 'Unban' : 'Ban'}
      </button>

      <button
        type="button"
        onClick={async () => {
          await ownerRemoveUserAccount(currentUser, acc.userId, prof?.usernameLower);
          onToast('User account removed');
        }}
        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Remove
      </button>
    </div>
  );
};
