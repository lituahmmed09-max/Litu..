import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Ban,
  Edit3,
  Flag,
  LogOut,
  MapPin,
  MessageCircle,
  Moon,
  Sun,
  UserCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  sendFriendRequest,
  submitReport,
  toggleBlockUser,
  toggleFollowUser,
  unfriendUser,
  updateUserSettings,
} from '../lib/zynkoApi';
import { PostDoc, PostVisibility, PublicProfile, UserDoc } from '../types/zynko';
import { Avatar, MediaRenderer } from './MediaRenderer';
import { PostCard } from './PostCard';

interface ProfileViewProps {
  targetProfile: PublicProfile;
  currentUid: string;
  currentUser: User;
  currentUserDoc: UserDoc | null;
  currentProfile: PublicProfile | null;
  posts: PostDoc[];
  profilesMap: Map<string, PublicProfile>;
  isFriend: boolean;
  isFollowing: boolean;
  hasOutgoingRequest: boolean;
  hasIncomingRequest: boolean;
  isBlocked: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onEditProfile: () => void;
  onStartChat: (uid: string) => void;
  onOpenProfile: (uid: string) => void;
  onImageClick: (src: string) => void;
  onSignOut: () => void;
  onToast: (msg: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  targetProfile,
  currentUid,
  currentUser,
  currentUserDoc,
  currentProfile,
  posts,
  profilesMap,
  isFriend,
  isFollowing,
  hasOutgoingRequest,
  hasIncomingRequest,
  isBlocked,
  darkMode,
  onToggleDarkMode,
  onEditProfile,
  onStartChat,
  onOpenProfile,
  onImageClick,
  onSignOut,
  onToast,
}) => {
  const isOwn = targetProfile.userId === currentUid;
  const [defaultVis, setDefaultVis] = useState<PostVisibility>(
    currentUserDoc?.defaultPostVisibility || 'PUBLIC'
  );

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
        {/* Cover */}
        <div className="h-32 sm:h-44 bg-gradient-to-r from-blue-600/20 via-sky-500/15 to-zinc-200 dark:from-blue-950/60 dark:via-zinc-900 dark:to-zinc-800 relative">
          {targetProfile.coverMediaId && (
            <MediaRenderer
              mediaId={targetProfile.coverMediaId}
              className="!rounded-none !h-full !max-h-none object-cover"
            />
          )}
        </div>

        <div className="px-5 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3 -mt-10 sm:-mt-12 relative z-10">
            <Avatar
              name={targetProfile.name}
              avatarUrl={targetProfile.avatarUrl}
              avatarMediaId={targetProfile.avatarMediaId}
              online={targetProfile.online}
              size="xl"
              className="ring-4 ring-white dark:ring-zinc-900 rounded-full"
            />

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {isOwn ? (
                <>
                  <button
                    type="button"
                    onClick={onEditProfile}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  {currentProfile && (
                    <button
                      type="button"
                      onClick={() =>
                        toggleFollowUser({
                          followerProfile: currentProfile,
                          targetUid: targetProfile.userId,
                          isCurrentlyFollowing: isFollowing,
                        })
                      }
                      className={`min-h-[42px] px-4 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                        isFollowing
                          ? 'border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                          : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}

                  {isFriend ? (
                    <button
                      type="button"
                      onClick={() => unfriendUser(currentUid, targetProfile.userId)}
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4 text-emerald-500" />
                      Friends
                    </button>
                  ) : hasIncomingRequest && currentProfile ? (
                    <button
                      type="button"
                      onClick={() =>
                        acceptFriendRequest({
                          fromUid: targetProfile.userId,
                          toProfile: currentProfile,
                        })
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium cursor-pointer"
                    >
                      Accept Request
                    </button>
                  ) : hasOutgoingRequest ? (
                    <button
                      type="button"
                      onClick={() =>
                        cancelFriendRequest(currentUid, targetProfile.userId)
                      }
                      className="min-h-[42px] px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-500 flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserMinus className="w-4 h-4" />
                      Cancel Request
                    </button>
                  ) : (
                    targetProfile.whoCanSendRequests !== 'NOBODY' &&
                    currentProfile && (
                      <button
                        type="button"
                        onClick={async () => {
                          await sendFriendRequest({
                            fromProfile: currentProfile,
                            toUid: targetProfile.userId,
                          });
                          onToast('Friend request sent');
                        }}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        Add Friend
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => onStartChat(targetProfile.userId)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Message
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3.5 space-y-1.5">
            <h1 className="font-display font-bold text-2xl text-zinc-900 dark:text-zinc-50">
              {targetProfile.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>@{targetProfile.username}</span>
              {targetProfile.location && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {targetProfile.location}
                  </span>
                </>
              )}
            </div>
            {targetProfile.bio && (
              <p className="text-sm text-zinc-700 dark:text-zinc-300 pt-1 leading-relaxed">
                {targetProfile.bio}
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <div>
              <div className="font-display font-bold text-base text-zinc-900 dark:text-zinc-100 tabular-nums">
                {Math.max(0, targetProfile.friendsCount || 0)}
              </div>
              <div className="text-[11px] text-zinc-500">Friends</div>
            </div>
            <div>
              <div className="font-display font-bold text-base text-zinc-900 dark:text-zinc-100 tabular-nums">
                {Math.max(0, targetProfile.followersCount || 0)}
              </div>
              <div className="text-[11px] text-zinc-500">Followers</div>
            </div>
            <div>
              <div className="font-display font-bold text-base text-zinc-900 dark:text-zinc-100 tabular-nums">
                {Math.max(0, targetProfile.followingCount || 0)}
              </div>
              <div className="text-[11px] text-zinc-500">Following</div>
            </div>
            <div>
              <div className="font-display font-bold text-base text-zinc-900 dark:text-zinc-100 tabular-nums">
                {posts.length}
              </div>
              <div className="text-[11px] text-zinc-500">Posts</div>
            </div>
          </div>

          {!isOwn && (
            <div className="flex items-center justify-end gap-4 pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <button
                type="button"
                onClick={async () => {
                  await toggleBlockUser(currentUid, targetProfile.userId, isBlocked);
                  onToast(isBlocked ? 'User unblocked' : 'User blocked');
                }}
                className="text-zinc-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                {isBlocked ? 'Unblock' : 'Block'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await submitReport({
                    reporterId: currentUid,
                    targetType: 'USER',
                    targetId: targetProfile.userId,
                    reason: 'Profile review requested',
                  });
                  onToast('User reported');
                }}
                className="text-zinc-500 hover:text-red-600 flex items-center gap-1 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                Report
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Own Preferences Card */}
      {isOwn && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-100 flex items-center gap-2 cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Default post visibility:</span>
            <select
              value={defaultVis}
              onChange={async (e) => {
                const next = e.target.value as PostVisibility;
                setDefaultVis(next);
                await updateUserSettings(currentUid, { defaultPostVisibility: next });
                onToast('Default visibility updated');
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-800 dark:text-zinc-100"
            >
              <option value="PUBLIC">Public</option>
              <option value="FRIENDS">Friends</option>
              <option value="ONLY_ME">Only Me</option>
            </select>
          </div>
        </div>
      )}

      {/* User's Posts */}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-8 text-center text-sm text-zinc-500">
            No posts shared yet.
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUid={currentUid}
              currentUser={currentUser}
              currentProfile={currentProfile}
              authorProfile={profilesMap.get(post.authorId)}
              onOpenProfile={onOpenProfile}
              onImageClick={onImageClick}
              onToast={onToast}
            />
          ))
        )}
      </div>
    </div>
  );
};
