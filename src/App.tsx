import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  Bell,
  Film,
  Home,
  Loader2,
  LogOut,
  MessageCircle,
  Moon,
  Plus,
  Search,
  ShieldAlert,
  ShieldBan,
  Star,
  Sun,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FriendsView } from './components/FriendsView';
import { Avatar } from './components/MediaRenderer';
import { MessengerView } from './components/MessengerView';
import { NotificationsView } from './components/NotificationsView';
import { PostCard } from './components/PostCard';
import { PostComposer } from './components/PostComposer';
import { ProfileSetupModal } from './components/ProfileSetupModal';
import { ProfileView } from './components/ProfileView';
import { StealthOwnerConsole } from './components/StealthOwnerConsole';
import { auth, db, handleFirestoreError, OperationType, testConnection } from './lib/firebase';
import { isStealthOwner, toMillis } from './lib/utils';
import {
  acceptFriendRequest,
  ensureUserDoc,
  setPresenceOffline,
  updateUserSettings,
} from './lib/zynkoApi';
import {
  ConversationDoc,
  FollowDoc,
  FriendRequestDoc,
  FriendshipDoc,
  NotificationDoc,
  PostDoc,
  PublicProfile,
  UserDoc,
} from './types/zynko';

type NavView =
  | 'feed'
  | 'friends'
  | 'messenger'
  | 'notifications'
  | 'profile'
  | 'owner';

type FeedFilter = 'all' | 'featured' | 'friends' | 'videos';

function ZynkoApp() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [myProfile, setMyProfile] = useState<PublicProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [posts, setPosts] = useState<PostDoc[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<FriendRequestDoc[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<FriendRequestDoc[]>([]);
  const [friendships, setFriendships] = useState<FriendshipDoc[]>([]);
  const [followingDocs, setFollowingDocs] = useState<FollowDoc[]>([]);
  const [followerDocs, setFollowerDocs] = useState<FollowDoc[]>([]);
  const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
  const [conversations, setConversations] = useState<ConversationDoc[]>([]);

  const [nav, setNav] = useState<NavView>('feed');
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const [viewedProfileUid, setViewedProfileUid] = useState<string | null>(null);
  const [chatTargetUid, setChatTargetUid] = useState<string | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);

  const [globalSearch, setGlobalSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileComposerOpen, setMobileComposerOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('zynko_dark_mode') === 'true';
    } catch {
      return false;
    }
  });

  const ownerMode = isStealthOwner(firebaseUser);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2600);
  };

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('zynko_dark_mode', String(darkMode));
    } catch {
      // Ignore storage errors
    }
  }, [darkMode]);

  // Test Firestore connection on initial boot
  useEffect(() => {
    testConnection();
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user) {
        await ensureUserDoc(user).catch(() => {});
      } else {
        setUserDoc(null);
        setMyProfile(null);
        setProfileChecked(false);
        setNav('feed');
      }
    });
    return () => unsub();
  }, []);

  // Keyboard shortcut for Stealth Owner (Ctrl+Shift+O)
  useEffect(() => {
    if (!ownerMode) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setNav((prev) => (prev === 'owner' ? 'feed' : 'owner'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ownerMode]);

  // Firestore real-time listeners once authenticated
  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    setProfileChecked(false);

    const handleUnload = () => {
      setPresenceOffline(uid);
    };
    window.addEventListener('beforeunload', handleUnload);

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserDoc;
          setUserDoc({ ...data, userId: snap.id });
          if (typeof data.darkMode === 'boolean') {
            setDarkMode(data.darkMode);
          }
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`, true);
      }
    );

    const unsubMyProfile = onSnapshot(
      doc(db, 'public_profiles', uid),
      (snap) => {
        if (snap.exists()) {
          setMyProfile({ ...(snap.data() as PublicProfile), userId: snap.id });
        } else {
          setMyProfile(null);
        }
        setProfileChecked(true);
      },
      (err) => {
        setProfileChecked(true);
        handleFirestoreError(err, OperationType.GET, `public_profiles/${uid}`, true);
      }
    );

    const unsubProfiles = onSnapshot(
      query(collection(db, 'public_profiles'), limit(250)),
      (snap) => {
        const list: PublicProfile[] = snap.docs.map((d) => ({
          ...(d.data() as PublicProfile),
          userId: d.id,
        }));
        setProfiles(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'public_profiles', true);
      }
    );

    const unsubPosts = onSnapshot(
      query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100)),
      (snap) => {
        const list: PostDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PostDoc, 'id'>),
        }));
        setPosts(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'posts', true);
      }
    );

    const unsubIncomingReq = onSnapshot(
      query(collection(db, 'friendRequests'), where('toUid', '==', uid)),
      (snap) => {
        setIncomingReqs(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequestDoc, 'id'>) }))
            .filter((r) => r.status === 'PENDING')
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests', true)
    );

    const unsubOutgoingReq = onSnapshot(
      query(collection(db, 'friendRequests'), where('fromUid', '==', uid)),
      (snap) => {
        setOutgoingReqs(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequestDoc, 'id'>) }))
            .filter((r) => r.status === 'PENDING')
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests', true)
    );

    const unsubFriendships = onSnapshot(
      query(collection(db, 'friendships'), where('userIds', 'array-contains', uid)),
      (snap) => {
        setFriendships(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FriendshipDoc, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships', true)
    );

    const unsubFollowing = onSnapshot(
      query(collection(db, 'follows'), where('followerId', '==', uid)),
      (snap) => {
        setFollowingDocs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FollowDoc, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'follows', true)
    );

    const unsubFollowers = onSnapshot(
      query(collection(db, 'follows'), where('followingId', '==', uid)),
      (snap) => {
        setFollowerDocs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FollowDoc, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'follows', true)
    );

    // Support both recipientId and userId notification docs from Android/Web
    const notifMap = new Map<string, NotificationDoc>();
    const syncNotifs = () => {
      const merged = Array.from(notifMap.values());
      merged.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      setNotifications(merged);
    };

    const unsubNotif1 = onSnapshot(
      query(collection(db, 'notifications'), where('recipientId', '==', uid)),
      (snap) => {
        snap.docs.forEach((d) =>
          notifMap.set(d.id, {
            id: d.id,
            ...(d.data() as Omit<NotificationDoc, 'id'>),
          })
        );
        syncNotifs();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications', true)
    );

    const unsubNotif2 = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid)),
      (snap) => {
        snap.docs.forEach((d) =>
          notifMap.set(d.id, {
            id: d.id,
            ...(d.data() as Omit<NotificationDoc, 'id'>),
          })
        );
        syncNotifs();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications', true)
    );

    const unsubConversations = onSnapshot(
      query(collection(db, 'conversations'), where('participantIds', 'array-contains', uid)),
      (snap) => {
        const list: ConversationDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ConversationDoc, 'id'>),
        }));
        list.sort(
          (a, b) =>
            toMillis(b.lastMessageAt || b.updatedAt || b.createdAt) -
            toMillis(a.lastMessageAt || a.updatedAt || a.createdAt)
        );
        setConversations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations', true)
    );

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      unsubUser();
      unsubMyProfile();
      unsubProfiles();
      unsubPosts();
      unsubIncomingReq();
      unsubOutgoingReq();
      unsubFriendships();
      unsubFollowing();
      unsubFollowers();
      unsubNotif1();
      unsubNotif2();
      unsubConversations();
    };
  }, [firebaseUser]);

  const profilesMap = useMemo(() => {
    const map = new Map<string, PublicProfile>();
    profiles.forEach((p) => map.set(p.userId, p));
    return map;
  }, [profiles]);

  const friendIds = useMemo(() => {
    if (!firebaseUser) return [];
    const uid = firebaseUser.uid;
    const ids = new Set<string>();
    friendships.forEach((f) => {
      f.userIds?.forEach((id) => {
        if (id !== uid) ids.add(id);
      });
    });
    return Array.from(ids);
  }, [friendships, firebaseUser]);

  const followingIds = useMemo(
    () => followingDocs.map((f) => f.followingId),
    [followingDocs]
  );

  const followerIds = useMemo(
    () => followerDocs.map((f) => f.followerId),
    [followerDocs]
  );

  const blockedIds = userDoc?.blockedUserIds || [];

  // Visible posts sorted with featured posts first, then newest
  const visibleFeedPosts = useMemo(() => {
    if (!firebaseUser) return [];
    const uid = firebaseUser.uid;
    const q = globalSearch.trim().toLowerCase();

    const filtered = posts.filter((post) => {
      if (post.moderationStatus === 'REMOVED') return false;
      if (blockedIds.includes(post.authorId)) return false;

      const authorProf = profilesMap.get(post.authorId);
      if (authorProf?.accountStatus === 'BANNED' || authorProf?.accountStatus === 'REMOVED') {
        return false;
      }

      if (post.authorId !== uid) {
        if (post.visibility === 'ONLY_ME') return false;
        if (post.visibility === 'FRIENDS') {
          const isFriend = friendIds.includes(post.authorId);
          const inAudience = post.audienceUids?.includes(uid);
          if (!isFriend && !inAudience) return false;
        }
      }

      if (highlightedPostId) {
        return post.id === highlightedPostId;
      }

      if (feedFilter === 'featured' && !post.featured) return false;
      if (feedFilter === 'friends' && !friendIds.includes(post.authorId) && post.authorId !== uid) {
        return false;
      }
      if (feedFilter === 'videos' && !post.mediaTypes?.some((t) => t.startsWith('video'))) {
        return false;
      }

      if (q) {
        const matchCaption = post.caption?.toLowerCase().includes(q);
        const matchAuthor = post.authorName?.toLowerCase().includes(q);
        const matchUser = post.authorUsername?.toLowerCase().includes(q);
        if (!matchCaption && !matchAuthor && !matchUser) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      const featDiff = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      if (featDiff !== 0) return featDiff;
      return toMillis(b.createdAt) - toMillis(a.createdAt);
    });

    return filtered;
  }, [
    posts,
    firebaseUser,
    blockedIds,
    profilesMap,
    friendIds,
    feedFilter,
    globalSearch,
    highlightedPostId,
  ]);

  const searchMatchingProfiles = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return profiles
      .filter(
        (p) =>
          p.accountStatus !== 'BANNED' &&
          p.accountStatus !== 'REMOVED' &&
          !blockedIds.includes(p.userId) &&
          (p.name.toLowerCase().includes(q) ||
            p.username.toLowerCase().includes(q) ||
            (p.bio || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [profiles, globalSearch, blockedIds]);

  const unreadNotifsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const handleToggleDark = async () => {
    const next = !darkMode;
    setDarkMode(next);
    if (firebaseUser) {
      await updateUserSettings(firebaseUser.uid, { darkMode: next }).catch(() => {});
    }
  };

  const handleSignOut = async () => {
    if (firebaseUser) {
      await setPresenceOffline(firebaseUser.uid);
    }
    await signOut(auth);
  };

  const openProfile = (uid: string) => {
    setHighlightedPostId(null);
    setViewedProfileUid(uid);
    setNav('profile');
    setMobileSearchOpen(false);
  };

  const startChat = (uid: string) => {
    setChatTargetUid(uid);
    setNav('messenger');
  };

  const openPostFromNotif = (postId: string) => {
    setHighlightedPostId(postId);
    setNav('feed');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthGate />;
  }

  // Account lock/ban gate (Stealth Owner is immune)
  if (
    !ownerMode &&
    userDoc?.accountStatus &&
    userDoc.accountStatus !== 'ACTIVE'
  ) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-7 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <ShieldBan className="w-6 h-6" />
          </div>
          <h1 className="font-display font-bold text-xl text-zinc-900 dark:text-zinc-50">
            Account {userDoc.accountStatus.toLowerCase()}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Your Zynko account is currently {userDoc.accountStatus.toLowerCase()} by moderation. Contact support if you believe this is a mistake.
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // First-time Profile Setup gate (bypassed automatically for Stealth Owner!)
  const needsProfileSetup = profileChecked && !myProfile && !ownerMode;

  const activeProfileTarget =
    profilesMap.get(viewedProfileUid || firebaseUser.uid) || myProfile;

  const onlineFriends = profiles.filter(
    (p) =>
      p.userId !== firebaseUser.uid &&
      friendIds.includes(p.userId) &&
      p.online &&
      p.accountStatus !== 'BANNED'
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-20 lg:pb-6">
      {/* Mobile Top Header (compact <= 56px) */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setHighlightedPostId(null);
            setNav('feed');
          }}
          className="flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-display font-bold text-base flex items-center justify-center">
            Z
          </div>
          <span className="font-display font-bold text-lg tracking-tight">
            Zynko
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="Search"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleToggleDark}
            aria-label="Toggle theme"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
          </button>

          {ownerMode && (
            <button
              type="button"
              onClick={() => setNav(nav === 'owner' ? 'feed' : 'owner')}
              aria-label="Control Center"
              className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center ${
                nav === 'owner'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => openProfile(firebaseUser.uid)}
            aria-label="My Profile"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center"
          >
            <Avatar
              name={myProfile?.name || firebaseUser.displayName || 'User'}
              avatarUrl={myProfile?.avatarUrl || firebaseUser.photoURL || ''}
              avatarMediaId={myProfile?.avatarMediaId}
              size="xs"
            />
          </button>
        </div>
      </header>

      {/* Mobile Expandable Search */}
      {mobileSearchOpen && (
        <div className="lg:hidden sticky top-14 z-20 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search people and posts..."
              className="w-full min-h-[42px] pl-10 pr-9 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm focus:outline-none"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchMatchingProfiles.length > 0 && (
            <div className="space-y-1 pt-1">
              {searchMatchingProfiles.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => openProfile(p.userId)}
                  className="w-full p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2.5 text-left"
                >
                  <Avatar
                    name={p.name}
                    avatarUrl={p.avatarUrl}
                    avatarMediaId={p.avatarMediaId}
                    size="xs"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{p.name}</div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      @{p.username}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Responsive Workspace (Desktop 3-Column / Mobile Single-Column) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:py-6 flex gap-6 items-start">
        {/* Desktop Left Navigation Rail */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 sticky top-6 h-[calc(100vh-3rem)] justify-between">
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => {
                setHighlightedPostId(null);
                setNav('feed');
              }}
              className="flex items-center gap-2.5 px-3 py-1 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-display font-bold text-lg flex items-center justify-center">
                Z
              </div>
              <span className="font-display font-bold text-xl tracking-tight">
                Zynko
              </span>
            </button>

            <nav className="space-y-1">
              {(
                [
                  { id: 'feed', label: 'Home Feed', icon: Home, badge: 0 },
                  {
                    id: 'friends',
                    label: 'Friends',
                    icon: Users,
                    badge: incomingReqs.length,
                  },
                  { id: 'messenger', label: 'Messenger', icon: MessageCircle, badge: 0 },
                  {
                    id: 'notifications',
                    label: 'Notifications',
                    icon: Bell,
                    badge: unreadNotifsCount,
                  },
                  { id: 'profile', label: 'Profile', icon: UserIcon, badge: 0 },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active =
                  nav === item.id &&
                  (item.id !== 'profile' ||
                    !viewedProfileUid ||
                    viewedProfileUid === firebaseUser.uid);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setHighlightedPostId(null);
                      if (item.id === 'profile') {
                        setViewedProfileUid(firebaseUser.uid);
                      }
                      setNav(item.id);
                    }}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 font-semibold'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </span>
                    {item.badge > 0 && (
                      <span className="text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {ownerMode && (
                <button
                  type="button"
                  onClick={() => setNav('owner')}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                    nav === 'owner'
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`}
                >
                  <ShieldAlert className="w-5 h-5" />
                  Control Center
                </button>
              )}
            </nav>

            <button
              type="button"
              onClick={() => {
                setHighlightedPostId(null);
                setNav('feed');
                setMobileComposerOpen(true);
              }}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Post
            </button>
          </div>

          <div className="space-y-2 pt-4 border-t border-zinc-200/80 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={handleToggleDark}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 flex items-center gap-2.5 cursor-pointer"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
              {darkMode ? 'Light Theme' : 'Dark Theme'}
            </button>

            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => openProfile(firebaseUser.uid)}
                className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
              >
                <Avatar
                  name={myProfile?.name || firebaseUser.displayName || 'Zynko'}
                  avatarUrl={myProfile?.avatarUrl || firebaseUser.photoURL || ''}
                  avatarMediaId={myProfile?.avatarMediaId}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {myProfile?.name || firebaseUser.displayName || 'Owner'}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {myProfile ? `@${myProfile.username}` : firebaseUser.email}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign Out"
                className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Center Workspace */}
        <main
          className={`flex-1 min-w-0 py-3 lg:py-0 ${
            nav === 'messenger' || nav === 'owner' ? 'max-w-5xl' : 'max-w-2xl'
          }`}
        >
          {nav === 'feed' && (
            <div className="space-y-4">
              {highlightedPostId && (
                <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl px-4 py-3 flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-700 dark:text-blue-300">
                    Viewing selected post
                  </span>
                  <button
                    type="button"
                    onClick={() => setHighlightedPostId(null)}
                    className="font-semibold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
                  >
                    Show all posts
                  </button>
                </div>
              )}

              {/* Inline Composer on Desktop/Tablet */}
              <div className="hidden sm:block">
                <PostComposer
                  uid={firebaseUser.uid}
                  profile={myProfile}
                  fallbackName={firebaseUser.displayName || 'Zynko User'}
                  fallbackAvatarUrl={firebaseUser.photoURL || ''}
                  defaultVisibility={userDoc?.defaultPostVisibility || 'PUBLIC'}
                  friendIds={friendIds}
                  onPosted={() => showToast('Post published')}
                />
              </div>

              {/* Feed Filter Bar */}
              <div className="flex items-center gap-1 p-1 bg-zinc-200/60 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-xl overflow-x-auto">
                {(
                  [
                    { id: 'all', label: 'All Posts', icon: Home },
                    { id: 'featured', label: 'Featured', icon: Star },
                    { id: 'friends', label: 'Friends', icon: Users },
                    { id: 'videos', label: 'Videos', icon: Film },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setHighlightedPostId(null);
                        setFeedFilter(item.id);
                      }}
                      className={`flex-1 min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        feedFilter === item.id
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Mobile Quick Search Results */}
              {globalSearch.trim() && searchMatchingProfiles.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-500">
                    Matching People
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {searchMatchingProfiles.map((p) => (
                      <button
                        key={p.userId}
                        type="button"
                        onClick={() => openProfile(p.userId)}
                        className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5 text-left cursor-pointer"
                      >
                        <Avatar
                          name={p.name}
                          avatarUrl={p.avatarUrl}
                          avatarMediaId={p.avatarMediaId}
                          online={p.online}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">{p.name}</div>
                          <div className="text-[11px] text-zinc-500 truncate">
                            @{p.username}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Posts Feed */}
              {visibleFeedPosts.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-10 text-center space-y-2">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    No posts match this view yet.
                  </p>
                  <p className="text-xs text-zinc-500">
                    Share a photo, video, or update to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleFeedPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUid={firebaseUser.uid}
                      currentUser={firebaseUser}
                      currentProfile={myProfile}
                      authorProfile={profilesMap.get(post.authorId)}
                      onOpenProfile={openProfile}
                      onImageClick={setLightboxSrc}
                      onToast={showToast}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {nav === 'friends' && (
            <FriendsView
              currentUid={firebaseUser.uid}
              currentProfile={myProfile}
              profiles={profiles}
              friendIds={friendIds}
              followingIds={followingIds}
              followerIds={followerIds}
              incomingRequests={incomingReqs}
              outgoingRequests={outgoingReqs}
              blockedIds={blockedIds}
              onOpenProfile={openProfile}
              onStartChat={startChat}
              onToast={showToast}
            />
          )}

          {nav === 'messenger' && (
            <MessengerView
              currentUid={firebaseUser.uid}
              currentName={myProfile?.name || firebaseUser.displayName || 'Zynko User'}
              conversations={conversations}
              profiles={profiles}
              initialTargetUid={chatTargetUid}
              onImageClick={setLightboxSrc}
            />
          )}

          {nav === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onOpenProfile={openProfile}
              onOpenPost={openPostFromNotif}
            />
          )}

          {nav === 'profile' && (
            <>
              {activeProfileTarget ? (
                <ProfileView
                  targetProfile={activeProfileTarget}
                  currentUid={firebaseUser.uid}
                  currentUser={firebaseUser}
                  currentUserDoc={userDoc}
                  currentProfile={myProfile}
                  posts={posts.filter(
                    (p) =>
                      p.authorId === activeProfileTarget.userId &&
                      p.moderationStatus !== 'REMOVED' &&
                      (p.authorId === firebaseUser.uid ||
                        p.visibility === 'PUBLIC' ||
                        (p.visibility === 'FRIENDS' &&
                          friendIds.includes(p.authorId)))
                  )}
                  profilesMap={profilesMap}
                  isFriend={friendIds.includes(activeProfileTarget.userId)}
                  isFollowing={followingIds.includes(activeProfileTarget.userId)}
                  hasOutgoingRequest={outgoingReqs.some(
                    (r) => r.toUid === activeProfileTarget.userId
                  )}
                  hasIncomingRequest={incomingReqs.some(
                    (r) => r.fromUid === activeProfileTarget.userId
                  )}
                  isBlocked={blockedIds.includes(activeProfileTarget.userId)}
                  darkMode={darkMode}
                  onToggleDarkMode={handleToggleDark}
                  onEditProfile={() => setEditingProfile(true)}
                  onStartChat={startChat}
                  onOpenProfile={openProfile}
                  onImageClick={setLightboxSrc}
                  onSignOut={handleSignOut}
                  onToast={showToast}
                />
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-4">
                  <h2 className="font-display font-bold text-lg">
                    Stealth Owner Session
                  </h2>
                  <p className="text-sm text-zinc-500">
                    You bypassed public profile setup. You can continue stealthily or optionally create a public profile anytime.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium cursor-pointer"
                    >
                      Create Public Profile
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="min-h-[42px] px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {nav === 'owner' && ownerMode && (
            <StealthOwnerConsole
              currentUser={firebaseUser}
              profiles={profiles}
              posts={posts}
              onToast={showToast}
            />
          )}
        </main>

        {/* Desktop Right Context Rail */}
        {nav !== 'messenger' && nav !== 'owner' && (
          <aside className="hidden xl:flex flex-col w-72 shrink-0 sticky top-6 space-y-4">
            {/* Global Search */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    if (nav !== 'feed') setNav('feed');
                  }}
                  placeholder="Search Zynko..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {globalSearch && (
                  <button
                    type="button"
                    onClick={() => setGlobalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Friend Requests Quick Card */}
            {incomingReqs.length > 0 && (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-semibold text-sm">
                    Friend Requests
                  </h2>
                  <button
                    type="button"
                    onClick={() => setNav('friends')}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    See all
                  </button>
                </div>
                <div className="space-y-2.5">
                  {incomingReqs.slice(0, 3).map((req) => {
                    const sender = profilesMap.get(req.fromUid);
                    if (!sender) return null;
                    return (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => openProfile(sender.userId)}
                          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                        >
                          <Avatar
                            name={sender.name}
                            avatarUrl={sender.avatarUrl}
                            avatarMediaId={sender.avatarMediaId}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">
                              {sender.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate">
                              @{sender.username}
                            </div>
                          </div>
                        </button>
                        {myProfile && (
                          <button
                            type="button"
                            onClick={() =>
                              acceptFriendRequest({
                                fromUid: req.fromUid,
                                toProfile: myProfile,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-medium shrink-0 cursor-pointer"
                          >
                            Accept
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Online Friends */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-sm">Contacts</h2>
                <span className="text-xs text-zinc-400 tabular-nums">
                  {onlineFriends.length} online
                </span>
              </div>
              {onlineFriends.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No friends online right now.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {onlineFriends.slice(0, 8).map((friend) => (
                    <button
                      key={friend.userId}
                      type="button"
                      onClick={() => startChat(friend.userId)}
                      className="w-full p-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/70 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
                    >
                      <Avatar
                        name={friend.name}
                        avatarUrl={friend.avatarUrl}
                        avatarMediaId={friend.avatarMediaId}
                        online={friend.online}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {friend.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          Tap to message
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Fixed Bottom Thumb-Zone Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200/80 dark:border-zinc-800/80 pb-safe">
        <div className="grid grid-cols-5 h-16 items-center">
          <button
            type="button"
            onClick={() => {
              setHighlightedPostId(null);
              setNav('feed');
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center ${
              nav === 'feed'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Feed</span>
          </button>

          <button
            type="button"
            onClick={() => setNav('friends')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center ${
              nav === 'friends'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Friends</span>
            {incomingReqs.length > 0 && (
              <span className="absolute top-1.5 right-4 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {incomingReqs.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileComposerOpen(true)}
            aria-label="Create post"
            className="min-h-[44px] flex flex-col items-center justify-center"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Plus className="w-5 h-5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setNav('messenger')}
            className={`min-h-[44px] flex flex-col items-center justify-center ${
              nav === 'messenger'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setNav('notifications')}
            className={`relative min-h-[44px] flex flex-col items-center justify-center ${
              nav === 'notifications'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Alerts</span>
            {unreadNotifsCount > 0 && (
              <span className="absolute top-1.5 right-4 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                {unreadNotifsCount}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile & Quick Post Composer Sheet */}
      {mobileComposerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 space-y-3 border border-zinc-200 dark:border-zinc-800">
            <div className="w-10 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full mx-auto sm:hidden" />
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-base">Create Post</h2>
              <button
                type="button"
                onClick={() => setMobileComposerOpen(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <PostComposer
              uid={firebaseUser.uid}
              profile={myProfile}
              fallbackName={firebaseUser.displayName || 'Zynko User'}
              fallbackAvatarUrl={firebaseUser.photoURL || ''}
              defaultVisibility={userDoc?.defaultPostVisibility || 'PUBLIC'}
              friendIds={friendIds}
              onPosted={() => {
                setMobileComposerOpen(false);
                showToast('Post published');
              }}
            />
          </div>
        </div>
      )}

      {/* Profile Setup / Edit Modal */}
      {(needsProfileSetup || editingProfile) && (
        <ProfileSetupModal
          firebaseUser={firebaseUser}
          existingProfile={myProfile}
          onComplete={() => {
            setEditingProfile(false);
            showToast('Profile saved');
          }}
          onCancel={needsProfileSetup ? undefined : () => setEditingProfile(false)}
        />
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            aria-label="Close image"
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-white/10 text-white flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxSrc}
            alt="Full view"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[90vh] object-contain rounded-xl"
          />
        </div>
      )}

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ZynkoApp />
    </ErrorBoundary>
  );
}
