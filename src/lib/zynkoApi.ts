import { User } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AccountStatus,
  MediaMimeType,
  ModerationStatus,
  PostDoc,
  PostVisibility,
  PublicProfile,
  RequestPolicy,
} from '../types/zynko';
import { db, handleFirestoreError, OperationType } from './firebase';
import { uploadMediaToFirestore } from './mediaCache';
import { getOrCreateWebDeviceInfo, isStealthOwner, pairId } from './utils';

export async function ensureUserDoc(firebaseUser: User): Promise<void> {
  const uid = firebaseUser.uid;
  const userRef = doc(db, 'users', uid);
  const { deviceId, deviceModel } = getOrCreateWebDeviceInfo();

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        userId: uid,
        email: firebaseUser.email || '',
        darkMode: false,
        language: 'en',
        blockedUserIds: [],
        whoCanSendRequests: 'EVERYONE',
        defaultPostVisibility: 'PUBLIC',
        accountStatus: 'ACTIVE',
        deviceId,
        deviceModel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        email: firebaseUser.email || snap.data().email || '',
        deviceId,
        deviceModel,
        updatedAt: serverTimestamp(),
      });
    }

    const profileRef = doc(db, 'public_profiles', uid);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      await updateDoc(profileRef, {
        online: true,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function setPresenceOffline(uid: string): Promise<void> {
  try {
    const profileRef = doc(db, 'public_profiles', uid);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      await updateDoc(profileRef, {
        online: false,
        lastSeen: serverTimestamp(),
      });
    }
  } catch {
    // Non-blocking on sign-out/unload
  }
}

export async function updateUserSettings(
  uid: string,
  updates: Partial<{
    darkMode: boolean;
    language: string;
    whoCanSendRequests: RequestPolicy;
    defaultPostVisibility: PostVisibility;
  }>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    if (updates.whoCanSendRequests) {
      const profileRef = doc(db, 'public_profiles', uid);
      const snap = await getDoc(profileRef);
      if (snap.exists()) {
        await updateDoc(profileRef, {
          whoCanSendRequests: updates.whoCanSendRequests,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function checkUsernameAvailable(
  username: string,
  currentUid?: string
): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  if (!lower || lower.length < 3) return false;
  try {
    const snap = await getDoc(doc(db, 'usernames', lower));
    if (!snap.exists()) return true;
    return snap.data().userId === currentUid;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${lower}`, true);
    return false;
  }
}

export async function savePublicProfile(params: {
  uid: string;
  email: string;
  name: string;
  username: string;
  bio: string;
  location: string;
  avatarUrl: string;
  avatarMediaId?: string;
  coverMediaId?: string;
  whoCanSendRequests: RequestPolicy;
  previousUsernameLower?: string;
  isNewProfile?: boolean;
}): Promise<void> {
  const usernameClean = params.username.trim();
  const usernameLower = usernameClean.toLowerCase();

  const available = await checkUsernameAvailable(usernameClean, params.uid);
  if (!available) {
    throw new Error('That username is already taken. Please choose another.');
  }

  try {
    const batch = writeBatch(db);
    if (params.previousUsernameLower && params.previousUsernameLower !== usernameLower) {
      batch.delete(doc(db, 'usernames', params.previousUsernameLower));
    }

    batch.set(doc(db, 'usernames', usernameLower), {
      userId: params.uid,
      username: usernameClean,
      createdAt: serverTimestamp(),
    });

    const profileRef = doc(db, 'public_profiles', params.uid);
    if (params.isNewProfile) {
      batch.set(profileRef, {
        userId: params.uid,
        name: params.name.trim(),
        username: usernameClean,
        usernameLower,
        bio: params.bio.trim(),
        location: params.location.trim(),
        avatarMediaId: params.avatarMediaId || '',
        avatarUrl: params.avatarUrl || '',
        coverMediaId: params.coverMediaId || '',
        friendsCount: 0,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        online: true,
        lastSeen: serverTimestamp(),
        accountStatus: 'ACTIVE',
        whoCanSendRequests: params.whoCanSendRequests,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(
        profileRef,
        {
          userId: params.uid,
          name: params.name.trim(),
          username: usernameClean,
          usernameLower,
          bio: params.bio.trim(),
          location: params.location.trim(),
          avatarMediaId: params.avatarMediaId || '',
          avatarUrl: params.avatarUrl || '',
          coverMediaId: params.coverMediaId || '',
          whoCanSendRequests: params.whoCanSendRequests,
          online: true,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    batch.set(
      doc(db, 'users', params.uid),
      {
        userId: params.uid,
        email: params.email,
        whoCanSendRequests: params.whoCanSendRequests,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `public_profiles/${params.uid}`);
  }
}

export async function createNotificationSafe(payload: {
  recipientId: string;
  actorId: string;
  actorName: string;
  actorUsername?: string;
  actorAvatarUrl?: string;
  actorAvatarMediaId?: string;
  type: string;
  postId?: string;
  message: string;
}): Promise<void> {
  if (!payload.recipientId || payload.recipientId === payload.actorId) return;
  try {
    await addDoc(collection(db, 'notifications'), {
      recipientId: payload.recipientId,
      userId: payload.recipientId,
      actorId: payload.actorId,
      actorName: payload.actorName,
      actorUsername: payload.actorUsername || '',
      actorAvatarUrl: payload.actorAvatarUrl || '',
      actorAvatarMediaId: payload.actorAvatarMediaId || '',
      type: payload.type,
      postId: payload.postId || '',
      message: payload.message,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking notification failure should not interrupt user actions
  }
}

export async function createPost(params: {
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string;
  authorAvatarMediaId: string;
  caption: string;
  visibility: PostVisibility;
  friendIds: string[];
  mediaItems: Array<{ mimeType: MediaMimeType; dataBase64: string }>;
}): Promise<string> {
  try {
    const mediaIds: string[] = [];
    const mediaTypes: string[] = [];

    for (const item of params.mediaItems) {
      const id = await uploadMediaToFirestore(params.authorId, item.mimeType, item.dataBase64);
      mediaIds.push(id);
      mediaTypes.push(item.mimeType);
    }

    const audienceUids =
      params.visibility === 'FRIENDS'
        ? Array.from(new Set([params.authorId, ...params.friendIds]))
        : params.visibility === 'ONLY_ME'
          ? [params.authorId]
          : [];

    const docRef = await addDoc(collection(db, 'posts'), {
      authorId: params.authorId,
      authorName: params.authorName,
      authorUsername: params.authorUsername,
      authorAvatarUrl: params.authorAvatarUrl,
      authorAvatarMediaId: params.authorAvatarMediaId,
      caption: params.caption.trim(),
      mediaIds,
      mediaTypes,
      visibility: params.visibility,
      audienceUids,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      moderationStatus: 'ACTIVE',
      featured: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const profileRef = doc(db, 'public_profiles', params.authorId);
    const pSnap = await getDoc(profileRef);
    if (pSnap.exists()) {
      await updateDoc(profileRef, {
        postsCount: increment(1),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }

    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'posts');
    throw error;
  }
}

export async function togglePostLike(params: {
  post: PostDoc;
  uid: string;
  actorName: string;
  actorUsername: string;
  actorAvatarUrl: string;
  actorAvatarMediaId: string;
  currentlyLiked: boolean;
}): Promise<void> {
  const likeRef = doc(db, 'posts', params.post.id, 'likes', params.uid);
  const postRef = doc(db, 'posts', params.post.id);

  try {
    if (params.currentlyLiked) {
      await deleteDoc(likeRef);
      await updateDoc(postRef, {
        likesCount: increment(-1),
      });
    } else {
      await setDoc(likeRef, {
        userId: params.uid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(postRef, {
        likesCount: increment(1),
      });
      await createNotificationSafe({
        recipientId: params.post.authorId,
        actorId: params.uid,
        actorName: params.actorName,
        actorUsername: params.actorUsername,
        actorAvatarUrl: params.actorAvatarUrl,
        actorAvatarMediaId: params.actorAvatarMediaId,
        type: 'LIKE',
        postId: params.post.id,
        message: `${params.actorName} liked your post.`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `posts/${params.post.id}/likes/${params.uid}`);
  }
}

export async function addPostComment(params: {
  post: PostDoc;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string;
  authorAvatarMediaId: string;
  text: string;
  replyToCommentId?: string;
  replyToAuthorId?: string;
  replyToAuthorName?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'posts', params.post.id, 'comments'), {
      authorId: params.authorId,
      authorName: params.authorName,
      authorUsername: params.authorUsername,
      authorAvatarUrl: params.authorAvatarUrl,
      authorAvatarMediaId: params.authorAvatarMediaId,
      text: params.text.trim(),
      replyToCommentId: params.replyToCommentId || '',
      replyToAuthorName: params.replyToAuthorName || '',
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'posts', params.post.id), {
      commentsCount: increment(1),
    });

    if (params.replyToAuthorId && params.replyToAuthorId !== params.authorId) {
      await createNotificationSafe({
        recipientId: params.replyToAuthorId,
        actorId: params.authorId,
        actorName: params.authorName,
        actorUsername: params.authorUsername,
        actorAvatarUrl: params.authorAvatarUrl,
        actorAvatarMediaId: params.authorAvatarMediaId,
        type: 'REPLY',
        postId: params.post.id,
        message: `${params.authorName} replied to your comment.`,
      });
    } else {
      await createNotificationSafe({
        recipientId: params.post.authorId,
        actorId: params.authorId,
        actorName: params.authorName,
        actorUsername: params.authorUsername,
        actorAvatarUrl: params.authorAvatarUrl,
        actorAvatarMediaId: params.authorAvatarMediaId,
        type: 'COMMENT',
        postId: params.post.id,
        message: `${params.authorName} commented on your post.`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${params.post.id}/comments`);
  }
}

export async function incrementPostShare(postId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'posts', postId), {
      sharesCount: increment(1),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`, true);
  }
}

export async function deleteOwnPost(postId: string, authorId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'posts', postId));
    const profileRef = doc(db, 'public_profiles', authorId);
    const snap = await getDoc(profileRef);
    if (snap.exists() && (snap.data().postsCount || 0) > 0) {
      await updateDoc(profileRef, { postsCount: increment(-1) }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
  }
}

export async function sendFriendRequest(params: {
  fromProfile: PublicProfile;
  toUid: string;
}): Promise<void> {
  const reqId = `${params.fromProfile.userId}_${params.toUid}`;
  try {
    await setDoc(doc(db, 'friendRequests', reqId), {
      fromUid: params.fromProfile.userId,
      toUid: params.toUid,
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await createNotificationSafe({
      recipientId: params.toUid,
      actorId: params.fromProfile.userId,
      actorName: params.fromProfile.name,
      actorUsername: params.fromProfile.username,
      actorAvatarUrl: params.fromProfile.avatarUrl,
      actorAvatarMediaId: params.fromProfile.avatarMediaId,
      type: 'FRIEND_REQUEST',
      message: `${params.fromProfile.name} sent you a friend request.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friendRequests/${reqId}`);
  }
}

export async function cancelFriendRequest(fromUid: string, toUid: string): Promise<void> {
  const reqId = `${fromUid}_${toUid}`;
  try {
    await deleteDoc(doc(db, 'friendRequests', reqId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendRequests/${reqId}`);
  }
}

export async function acceptFriendRequest(params: {
  fromUid: string;
  toProfile: PublicProfile;
}): Promise<void> {
  const reqId = `${params.fromUid}_${params.toProfile.userId}`;
  const fId = pairId(params.fromUid, params.toProfile.userId);
  const [uid1, uid2] = [params.fromUid, params.toProfile.userId].sort();

  try {
    await updateDoc(doc(db, 'friendRequests', reqId), {
      status: 'ACCEPTED',
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'friendships', fId), {
      userIds: [uid1, uid2],
      uid1,
      uid2,
      createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, 'public_profiles', params.toProfile.userId), {
      friendsCount: increment(1),
    }).catch(() => {});
    await updateDoc(doc(db, 'public_profiles', params.fromUid), {
      friendsCount: increment(1),
    }).catch(() => {});

    await createNotificationSafe({
      recipientId: params.fromUid,
      actorId: params.toProfile.userId,
      actorName: params.toProfile.name,
      actorUsername: params.toProfile.username,
      actorAvatarUrl: params.toProfile.avatarUrl,
      actorAvatarMediaId: params.toProfile.avatarMediaId,
      type: 'FRIEND_ACCEPT',
      message: `${params.toProfile.name} accepted your friend request.`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friendships/${fId}`);
  }
}

export async function rejectFriendRequest(fromUid: string, toUid: string): Promise<void> {
  const reqId = `${fromUid}_${toUid}`;
  try {
    await updateDoc(doc(db, 'friendRequests', reqId), {
      status: 'REJECTED',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `friendRequests/${reqId}`);
  }
}

export async function unfriendUser(uid1: string, uid2: string): Promise<void> {
  const fId = pairId(uid1, uid2);
  try {
    await deleteDoc(doc(db, 'friendships', fId));
    await deleteDoc(doc(db, 'friendRequests', `${uid1}_${uid2}`)).catch(() => {});
    await deleteDoc(doc(db, 'friendRequests', `${uid2}_${uid1}`)).catch(() => {});
    await updateDoc(doc(db, 'public_profiles', uid1), { friendsCount: increment(-1) }).catch(() => {});
    await updateDoc(doc(db, 'public_profiles', uid2), { friendsCount: increment(-1) }).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `friendships/${fId}`);
  }
}

export async function toggleFollowUser(params: {
  followerProfile: PublicProfile;
  targetUid: string;
  isCurrentlyFollowing: boolean;
}): Promise<void> {
  const followId = `${params.followerProfile.userId}_${params.targetUid}`;
  try {
    if (params.isCurrentlyFollowing) {
      await deleteDoc(doc(db, 'follows', followId));
      await updateDoc(doc(db, 'public_profiles', params.followerProfile.userId), {
        followingCount: increment(-1),
      }).catch(() => {});
      await updateDoc(doc(db, 'public_profiles', params.targetUid), {
        followersCount: increment(-1),
      }).catch(() => {});
    } else {
      await setDoc(doc(db, 'follows', followId), {
        followerId: params.followerProfile.userId,
        followingId: params.targetUid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'public_profiles', params.followerProfile.userId), {
        followingCount: increment(1),
      }).catch(() => {});
      await updateDoc(doc(db, 'public_profiles', params.targetUid), {
        followersCount: increment(1),
      }).catch(() => {});
      await createNotificationSafe({
        recipientId: params.targetUid,
        actorId: params.followerProfile.userId,
        actorName: params.followerProfile.name,
        actorUsername: params.followerProfile.username,
        actorAvatarUrl: params.followerProfile.avatarUrl,
        actorAvatarMediaId: params.followerProfile.avatarMediaId,
        type: 'FOLLOW',
        message: `${params.followerProfile.name} started following you.`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `follows/${followId}`);
  }
}

export async function toggleBlockUser(
  currentUid: string,
  targetUid: string,
  isBlocked: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', currentUid), {
      blockedUserIds: isBlocked ? arrayRemove(targetUid) : arrayUnion(targetUid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${currentUid}`);
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`, true);
  }
}

export async function submitReport(params: {
  reporterId: string;
  targetType: 'POST' | 'USER';
  targetId: string;
  targetAuthorId?: string;
  reason: string;
  details?: string;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'reports'), {
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      targetAuthorId: params.targetAuthorId || '',
      reason: params.reason,
      details: params.details || '',
      status: 'PENDING',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
  }
}

export async function sendChatMessage(params: {
  senderUid: string;
  senderName: string;
  recipientUid: string;
  text: string;
  mediaItem?: { mimeType: MediaMimeType; dataBase64: string } | null;
}): Promise<string> {
  const convId = pairId(params.senderUid, params.recipientUid);
  const participants = [params.senderUid, params.recipientUid].sort();

  try {
    let mediaId = '';
    let mediaType = '';
    if (params.mediaItem) {
      mediaId = await uploadMediaToFirestore(
        params.senderUid,
        params.mediaItem.mimeType,
        params.mediaItem.dataBase64
      );
      mediaType = params.mediaItem.mimeType;
    }

    const previewText =
      params.text.trim() ||
      (mediaType.startsWith('video') ? 'Sent a video' : mediaId ? 'Sent a photo' : '');

    await setDoc(
      doc(db, 'conversations', convId),
      {
        participantIds: participants,
        lastMessage: previewText,
        lastSenderId: params.senderUid,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    await addDoc(collection(db, 'conversations', convId, 'messages'), {
      conversationId: convId,
      senderId: params.senderUid,
      senderName: params.senderName,
      text: params.text.trim(),
      mediaId,
      mediaType,
      createdAt: serverTimestamp(),
    });

    return convId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `conversations/${convId}`);
    throw error;
  }
}

// ============================================================================
// Stealth Owner Control Center Actions (Verified lituahmmed85@gmail.com ONLY)
// ============================================================================

function assertStealthOwner(currentUser: User | null): void {
  if (!isStealthOwner(currentUser)) {
    throw new Error('Unauthorized owner action.');
  }
}

export async function ownerSetUserAccountStatus(
  currentUser: User | null,
  targetUid: string,
  status: AccountStatus
): Promise<void> {
  assertStealthOwner(currentUser);
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      accountStatus: status,
      updatedAt: serverTimestamp(),
    });
    const profRef = doc(db, 'public_profiles', targetUid);
    const snap = await getDoc(profRef);
    if (snap.exists()) {
      await updateDoc(profRef, {
        accountStatus: status,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

export async function ownerRemoveUserAccount(
  currentUser: User | null,
  targetUid: string,
  usernameLower?: string
): Promise<void> {
  assertStealthOwner(currentUser);
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'users', targetUid),
      { accountStatus: 'REMOVED', updatedAt: serverTimestamp() },
      { merge: true }
    );
    batch.delete(doc(db, 'public_profiles', targetUid));
    if (usernameLower) {
      batch.delete(doc(db, 'usernames', usernameLower));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${targetUid}`);
  }
}

export async function ownerSetPostFeatured(
  currentUser: User | null,
  postId: string,
  featured: boolean
): Promise<void> {
  assertStealthOwner(currentUser);
  try {
    await updateDoc(doc(db, 'posts', postId), {
      featured,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function ownerSetPostModeration(
  currentUser: User | null,
  postId: string,
  moderationStatus: ModerationStatus
): Promise<void> {
  assertStealthOwner(currentUser);
  try {
    await updateDoc(doc(db, 'posts', postId), {
      moderationStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function ownerDeletePost(
  currentUser: User | null,
  postId: string,
  mediaIds: string[] = []
): Promise<void> {
  assertStealthOwner(currentUser);
  try {
    await deleteDoc(doc(db, 'posts', postId));
    for (const mId of mediaIds) {
      if (mId) {
        await deleteDoc(doc(db, 'media', mId)).catch(() => {});
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
  }
}

export async function ownerResolveReport(
  currentUser: User | null,
  reportId: string
): Promise<void> {
  assertStealthOwner(currentUser);
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status: 'RESOLVED',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}
