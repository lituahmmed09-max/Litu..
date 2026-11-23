export const OWNER_EMAIL = 'lituahmmed85@gmail.com';

export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'BANNED' | 'REMOVED';
export type PostVisibility = 'PUBLIC' | 'FRIENDS' | 'ONLY_ME';
export type RequestPolicy = 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NOBODY';
export type ModerationStatus = 'ACTIVE' | 'REMOVED';
export type MediaMimeType = 'image/jpeg' | 'video/mp4' | 'audio/mp4';

export type TimestampLike =
  | number
  | string
  | Date
  | { toMillis?: () => number; seconds?: number; nanoseconds?: number }
  | null
  | undefined;

export interface UserDoc {
  userId: string;
  email: string;
  darkMode: boolean;
  language: string;
  blockedUserIds: string[];
  whoCanSendRequests: RequestPolicy;
  defaultPostVisibility: PostVisibility;
  accountStatus: AccountStatus;
  deviceId: string;
  deviceModel: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface PublicProfile {
  userId: string;
  name: string;
  username: string;
  usernameLower: string;
  bio: string;
  location: string;
  avatarMediaId: string;
  avatarUrl: string;
  coverMediaId: string;
  friendsCount: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  online: boolean;
  lastSeen?: TimestampLike;
  accountStatus: AccountStatus;
  whoCanSendRequests: RequestPolicy;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface PostDoc {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string;
  authorAvatarMediaId: string;
  caption: string;
  mediaIds: string[];
  mediaTypes: string[];
  visibility: PostVisibility;
  audienceUids: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  moderationStatus: ModerationStatus;
  featured: boolean;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface CommentDoc {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  authorAvatarMediaId?: string;
  text: string;
  replyToCommentId?: string;
  replyToAuthorName?: string;
  createdAt?: TimestampLike;
}

export interface FriendRequestDoc {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
}

export interface FriendshipDoc {
  id: string;
  userIds: string[];
  uid1?: string;
  uid2?: string;
  createdAt?: TimestampLike;
}

export interface FollowDoc {
  id: string;
  followerId: string;
  followingId: string;
  createdAt?: TimestampLike;
}

export interface NotificationDoc {
  id: string;
  recipientId?: string;
  userId?: string;
  toUid?: string;
  actorId: string;
  actorName?: string;
  actorUsername?: string;
  actorAvatarUrl?: string;
  actorAvatarMediaId?: string;
  type: string;
  postId?: string;
  message?: string;
  read: boolean;
  createdAt?: TimestampLike;
}

export interface ReportDoc {
  id: string;
  reporterId: string;
  targetType: 'POST' | 'USER';
  targetId: string;
  targetAuthorId?: string;
  reason: string;
  details?: string;
  status?: 'PENDING' | 'RESOLVED';
  createdAt?: TimestampLike;
}

export interface ConversationDoc {
  id: string;
  participantIds: string[];
  lastMessage?: string;
  lastSenderId?: string;
  lastMessageAt?: TimestampLike;
  updatedAt?: TimestampLike;
  createdAt?: TimestampLike;
}

export interface MessageDoc {
  id: string;
  conversationId?: string;
  senderId: string;
  senderName?: string;
  text: string;
  mediaId?: string;
  mediaType?: string;
  createdAt?: TimestampLike;
}

export interface MediaDoc {
  id: string;
  ownerId: string;
  mimeType: MediaMimeType;
  dataBase64: string;
  createdAt?: TimestampLike;
}
