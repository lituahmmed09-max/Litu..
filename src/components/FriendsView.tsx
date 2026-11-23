import React, { useMemo, useState } from 'react';
import {
  Check,
  MessageCircle,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  rejectFriendRequest,
  sendFriendRequest,
  toggleFollowUser,
  unfriendUser,
} from '../lib/zynkoApi';
import { FriendRequestDoc, PublicProfile } from '../types/zynko';
import { Avatar } from './MediaRenderer';

interface FriendsViewProps {
  currentUid: string;
  currentProfile: PublicProfile | null;
  profiles: PublicProfile[];
  friendIds: string[];
  followingIds: string[];
  followerIds: string[];
  incomingRequests: FriendRequestDoc[];
  outgoingRequests: FriendRequestDoc[];
  blockedIds: string[];
  onOpenProfile: (uid: string) => void;
  onStartChat: (uid: string) => void;
  onToast: (msg: string) => void;
}

type SubTab = 'requests' | 'friends' | 'following' | 'discover';

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUid,
  currentProfile,
  profiles,
  friendIds,
  followingIds,
  followerIds,
  incomingRequests,
  outgoingRequests,
  blockedIds,
  onOpenProfile,
  onStartChat,
  onToast,
}) => {
  const [tab, setTab] = useState<SubTab>(
    incomingRequests.length > 0 ? 'requests' : 'friends'
  );
  const [queryText, setQueryText] = useState('');

  const profileMap = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    profiles.forEach((p) => map.set(p.userId, p));
    return map;
  }, [profiles]);

  const activeOthers = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return profiles.filter((p) => {
      if (p.userId === currentUid) return false;
      if (p.accountStatus === 'BANNED' || p.accountStatus === 'REMOVED') return false;
      if (blockedIds.includes(p.userId)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q)
      );
    });
  }, [profiles, currentUid, blockedIds, queryText]);

  const friendsList = useMemo(
    () => activeOthers.filter((p) => friendIds.includes(p.userId)),
    [activeOthers, friendIds]
  );

  const followingList = useMemo(
    () =>
      activeOthers.filter(
        (p) => followingIds.includes(p.userId) || followerIds.includes(p.userId)
      ),
    [activeOthers, followingIds, followerIds]
  );

  const outgoingSet = useMemo(
    () => new Set(outgoingRequests.map((r) => r.toUid)),
    [outgoingRequests]
  );

  const incomingSet = useMemo(
    () => new Set(incomingRequests.map((r) => r.fromUid)),
    [incomingRequests]
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="font-display font-bold text-xl text-zinc-900 dark:text-zinc-50">
            Friends &amp; People
          </h1>

          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-x-auto">
            {(
              [
                { id: 'requests', label: `Requests (${incomingRequests.length})` },
                { id: 'friends', label: `Friends (${friendIds.length})` },
                { id: 'following', label: 'Follows' },
                { id: 'discover', label: 'Discover' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  tab === item.id
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Search people by name, @username, or city..."
            className="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Requests Tab */}
      {tab === 'requests' && (
        <div className="space-y-3">
          {incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-8 text-center text-sm text-zinc-500">
              No pending friend requests right now.
            </div>
          ) : (
            <>
              {incomingRequests.map((req) => {
                const sender = profileMap.get(req.fromUid);
                if (!sender) return null;
                return (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenProfile(sender.userId)}
                      className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                    >
                      <Avatar
                        name={sender.name}
                        avatarUrl={sender.avatarUrl}
                        avatarMediaId={sender.avatarMediaId}
                        online={sender.online}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {sender.name}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          @{sender.username}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!currentProfile) return;
                          await acceptFriendRequest({
                            fromUid: req.fromUid,
                            toProfile: currentProfile,
                          });
                          onToast(`You and ${sender.name} are now friends`);
                        }}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await rejectFriendRequest(req.fromUid, currentUid);
                          onToast('Request declined');
                        }}
                        className="min-h-[40px] min-w-[40px] rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer"
                        aria-label="Decline"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {outgoingRequests.map((req) => {
                const target = profileMap.get(req.toUid);
                if (!target) return null;
                return (
                  <div
                    key={req.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenProfile(target.userId)}
                      className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                    >
                      <Avatar
                        name={target.name}
                        avatarUrl={target.avatarUrl}
                        avatarMediaId={target.avatarMediaId}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {target.name}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          @{target.username} · Sent request
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await cancelFriendRequest(currentUid, target.userId);
                        onToast('Request cancelled');
                      }}
                      className="min-h-[40px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Friends Tab */}
      {tab === 'friends' && (
        <div className="space-y-2.5">
          {friendsList.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-8 text-center text-sm text-zinc-500">
              No friends added yet. Switch to Discover to connect with people on Zynko.
            </div>
          ) : (
            friendsList.map((person) => (
              <div
                key={person.userId}
                className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => onOpenProfile(person.userId)}
                  className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                >
                  <Avatar
                    name={person.name}
                    avatarUrl={person.avatarUrl}
                    avatarMediaId={person.avatarMediaId}
                    online={person.online}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                      {person.name}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      @{person.username}
                      {person.location ? ` · ${person.location}` : ''}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartChat(person.userId)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span className="hidden sm:inline">Message</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await unfriendUser(currentUid, person.userId);
                      onToast(`Removed ${person.name} from friends`);
                    }}
                    title="Unfriend"
                    className="min-h-[40px] min-w-[40px] rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-red-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-center cursor-pointer"
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Following / Followers Tab */}
      {tab === 'following' && (
        <div className="space-y-2.5">
          {followingList.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-8 text-center text-sm text-zinc-500">
              No follow connections yet.
            </div>
          ) : (
            followingList.map((person) => {
              const isFollowing = followingIds.includes(person.userId);
              const followsYou = followerIds.includes(person.userId);
              return (
                <div
                  key={person.userId}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(person.userId)}
                    className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                  >
                    <Avatar
                      name={person.name}
                      avatarUrl={person.avatarUrl}
                      avatarMediaId={person.avatarMediaId}
                      online={person.online}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {person.name}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        @{person.username}
                        {followsYou ? ' · Follows you' : ''}
                      </div>
                    </div>
                  </button>

                  {currentProfile && (
                    <button
                      type="button"
                      onClick={() =>
                        toggleFollowUser({
                          followerProfile: currentProfile,
                          targetUid: person.userId,
                          isCurrentlyFollowing: isFollowing,
                        })
                      }
                      className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer shrink-0 ${
                        isFollowing
                          ? 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow Back'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Discover Tab */}
      {tab === 'discover' && (
        <div className="space-y-2.5">
          {activeOthers.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-8 text-center text-sm text-zinc-500">
              No matching users found.
            </div>
          ) : (
            activeOthers.map((person) => {
              const isFriend = friendIds.includes(person.userId);
              const isFollowing = followingIds.includes(person.userId);
              const hasOutgoing = outgoingSet.has(person.userId);
              const hasIncoming = incomingSet.has(person.userId);
              const allowsRequests = person.whoCanSendRequests !== 'NOBODY';

              return (
                <div
                  key={person.userId}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(person.userId)}
                    className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
                  >
                    <Avatar
                      name={person.name}
                      avatarUrl={person.avatarUrl}
                      avatarMediaId={person.avatarMediaId}
                      online={person.online}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {person.name}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">
                        @{person.username}
                        {person.location ? ` · ${person.location}` : ''}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {currentProfile && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleFollowUser({
                            followerProfile: currentProfile,
                            targetUid: person.userId,
                            isCurrentlyFollowing: isFollowing,
                          })
                        }
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                          isFollowing
                            ? 'border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}

                    {isFriend ? (
                      <button
                        type="button"
                        onClick={() => onStartChat(person.userId)}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4" />
                        Friends
                      </button>
                    ) : hasIncoming && currentProfile ? (
                      <button
                        type="button"
                        onClick={() =>
                          acceptFriendRequest({
                            fromUid: person.userId,
                            toProfile: currentProfile,
                          })
                        }
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium cursor-pointer"
                      >
                        Accept
                      </button>
                    ) : hasOutgoing ? (
                      <button
                        type="button"
                        onClick={() => cancelFriendRequest(currentUid, person.userId)}
                        className="min-h-[40px] px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 cursor-pointer"
                      >
                        Requested
                      </button>
                    ) : (
                      allowsRequests &&
                      currentProfile && (
                        <button
                          type="button"
                          onClick={async () => {
                            await sendFriendRequest({
                              fromProfile: currentProfile,
                              toUid: person.userId,
                            });
                            onToast(`Friend request sent to ${person.name}`);
                          }}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                          <UserPlus className="w-4 h-4" />
                          Add
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
