import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  CornerDownRight,
  Eye,
  EyeOff,
  Flag,
  Globe,
  Heart,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatRelativeTime, isStealthOwner, toMillis } from '../lib/utils';
import {
  addPostComment,
  deleteOwnPost,
  incrementPostShare,
  ownerDeletePost,
  ownerSetPostFeatured,
  ownerSetPostModeration,
  submitReport,
  togglePostLike,
} from '../lib/zynkoApi';
import { CommentDoc, PostDoc, PublicProfile } from '../types/zynko';
import { Avatar, MediaRenderer } from './MediaRenderer';

interface PostCardProps {
  post: PostDoc;
  currentUid: string;
  currentUser: User;
  currentProfile: PublicProfile | null;
  authorProfile?: PublicProfile;
  onOpenProfile: (uid: string) => void;
  onImageClick: (src: string) => void;
  onToast: (msg: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUid,
  currentUser,
  currentProfile,
  authorProfile,
  onOpenProfile,
  onImageClick,
  onToast,
}) => {
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommentDoc | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or misleading');

  const ownerMode = isStealthOwner(currentUser);
  const isAuthor = post.authorId === currentUid;

  // Listen to current user's like document on this post
  useEffect(() => {
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUid);
    const unsub = onSnapshot(
      likeRef,
      (snap) => {
        setLiked(snap.exists());
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `posts/${post.id}/likes/${currentUid}`, true);
      }
    );
    return () => unsub();
  }, [post.id, currentUid]);

  // Listen to comments only when comments drawer is expanded
  useEffect(() => {
    if (!showComments) return;
    const q = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CommentDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CommentDoc, 'id'>),
        }));
        list.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
        setComments(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `posts/${post.id}/comments`, true);
      }
    );
    return () => unsub();
  }, [post.id, showComments]);

  const actorName = currentProfile?.name || currentUser.displayName || 'Zynko User';
  const actorUsername = currentProfile?.username || 'zynko';
  const actorAvatarUrl = currentProfile?.avatarUrl || currentUser.photoURL || '';
  const actorAvatarMediaId = currentProfile?.avatarMediaId || '';

  const handleLike = async () => {
    await togglePostLike({
      post,
      uid: currentUid,
      actorName,
      actorUsername,
      actorAvatarUrl,
      actorAvatarMediaId,
      currentlyLiked: liked,
    });
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      await addPostComment({
        post,
        authorId: currentUid,
        authorName: actorName,
        authorUsername: actorUsername,
        authorAvatarUrl: actorAvatarUrl,
        authorAvatarMediaId: actorAvatarMediaId,
        text: commentText,
        replyToCommentId: replyTarget?.id,
        replyToAuthorId: replyTarget?.authorId,
        replyToAuthorName: replyTarget?.authorName,
      });
      setCommentText('');
      setReplyTarget(null);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleShare = async () => {
    await incrementPostShare(post.id);
    const shareText = `${post.authorName}: ${post.caption || 'Check out this post on Zynko'}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Zynko Post',
          text: shareText,
          url: window.location.href,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} — ${window.location.href}`);
      onToast('Post link copied to clipboard');
    } catch {
      onToast('Shared');
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitReport({
      reporterId: currentUid,
      targetType: 'POST',
      targetId: post.id,
      targetAuthorId: post.authorId,
      reason: reportReason,
    });
    setReporting(false);
    setMenuOpen(false);
    onToast('Report submitted');
  };

  const displayAuthorName = authorProfile?.name || post.authorName || 'Zynko User';
  const displayUsername = authorProfile?.username || post.authorUsername || 'zynko';
  const displayAvatarUrl = authorProfile?.avatarUrl || post.authorAvatarUrl;
  const displayAvatarMediaId =
    authorProfile?.avatarMediaId || post.authorAvatarMediaId;

  const VisibilityIcon =
    post.visibility === 'FRIENDS'
      ? Users
      : post.visibility === 'ONLY_ME'
        ? Lock
        : Globe;

  const visibilityLabel =
    post.visibility === 'FRIENDS'
      ? 'Friends'
      : post.visibility === 'ONLY_ME'
        ? 'Only Me'
        : 'Public';

  // Group top-level comments & replies
  const topComments = comments.filter((c) => !c.replyToCommentId);
  const repliesByParent = new Map<string, CommentDoc[]>();
  for (const c of comments) {
    if (c.replyToCommentId) {
      const arr = repliesByParent.get(c.replyToCommentId) || [];
      arr.push(c);
      repliesByParent.set(c.replyToCommentId, arr);
    }
  }

  return (
    <article className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpenProfile(post.authorId)}
          className="flex items-center gap-3 text-left min-w-0 group cursor-pointer"
        >
          <Avatar
            name={displayAuthorName}
            avatarUrl={displayAvatarUrl}
            avatarMediaId={displayAvatarMediaId}
            online={authorProfile?.online}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 group-hover:underline truncate">
                {displayAuthorName}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                @{displayUsername}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {post.featured && (
                <>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    Featured
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {post.moderationStatus === 'REMOVED' && (
                <>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    Hidden
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{formatRelativeTime(post.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <VisibilityIcon className="w-3 h-3" />
                {visibilityLabel}
              </span>
            </div>
          </div>
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Post options"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-lg py-1.5 z-20 text-xs">
              {isAuthor && (
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false);
                    await deleteOwnPost(post.id, post.authorId);
                    onToast('Post deleted');
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-red-600 dark:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Post
                </button>
              )}

              {!isAuthor && (
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="w-full px-3.5 py-2.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                  Report Post
                </button>
              )}

              {ownerMode && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      await ownerSetPostFeatured(currentUser, post.id, !post.featured);
                      onToast(post.featured ? 'Removed from featured' : 'Marked featured');
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Star className="w-4 h-4" />
                    {post.featured ? 'Unfeature Post' : 'Feature Post'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      const next =
                        post.moderationStatus === 'REMOVED' ? 'ACTIVE' : 'REMOVED';
                      await ownerSetPostModeration(currentUser, post.id, next);
                      onToast(next === 'REMOVED' ? 'Post hidden' : 'Post restored');
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-amber-600 dark:text-amber-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    {post.moderationStatus === 'REMOVED' ? (
                      <>
                        <Eye className="w-4 h-4" /> Restore Post
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" /> Hide Post
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      await ownerDeletePost(currentUser, post.id, post.mediaIds);
                      onToast('Post permanently deleted');
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-red-600 dark:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Owner Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Inline Report Form */}
      {reporting && (
        <form
          onSubmit={handleReportSubmit}
          className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 space-y-2"
        >
          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Report reason
          </div>
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs"
          >
            <option>Spam or misleading</option>
            <option>Harassment or hate speech</option>
            <option>Inappropriate media</option>
            <option>Scam or impersonation</option>
          </select>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReporting(false);
                setMenuOpen(false);
              }}
              className="px-3 py-1.5 text-xs text-zinc-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium"
            >
              Submit Report
            </button>
          </div>
        </form>
      )}

      {/* Caption */}
      {post.caption && (
        <p className="text-sm sm:text-[15px] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed break-words">
          {post.caption}
        </p>
      )}

      {/* Media */}
      {post.mediaIds && post.mediaIds.length > 0 && (
        <div
          className={`grid gap-2 ${
            post.mediaIds.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {post.mediaIds.map((mediaId, idx) => (
            <MediaRenderer
              key={`${mediaId}_${idx}`}
              mediaId={mediaId}
              mimeTypeHint={post.mediaTypes?.[idx]}
              onImageClick={onImageClick}
            />
          ))}
        </div>
      )}

      {/* Action Bar */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleLike}
          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
            liked
              ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
          <span className="tabular-nums">{Math.max(0, post.likesCount || 0)}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
            showComments
              ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span className="tabular-nums">{Math.max(0, post.commentsCount || 0)}</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span className="tabular-nums">{Math.max(0, post.sharesCount || 0)}</span>
        </button>
      </div>

      {/* Comments & Replies Drawer */}
      {showComments && (
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          {topComments.length === 0 ? (
            <p className="text-xs text-zinc-400 py-1">
              No comments yet. Start the conversation.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto zynko-scroll pr-1">
              {topComments.map((comment) => {
                const replies = repliesByParent.get(comment.id) || [];
                return (
                  <div key={comment.id} className="space-y-2">
                    <div className="flex gap-2.5">
                      <Avatar
                        name={comment.authorName}
                        avatarUrl={comment.authorAvatarUrl}
                        avatarMediaId={comment.authorAvatarMediaId}
                        size="xs"
                      />
                      <div className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800/70 rounded-2xl px-3.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenProfile(comment.authorId)}
                            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:underline truncate cursor-pointer"
                          >
                            {comment.authorName || 'User'}
                          </button>
                          <span className="text-[11px] text-zinc-400 shrink-0">
                            {formatRelativeTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs sm:text-[13px] text-zinc-700 dark:text-zinc-200 mt-0.5 break-words">
                          {comment.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => setReplyTarget(comment)}
                          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-1 hover:underline cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                    </div>

                    {replies.length > 0 && (
                      <div className="pl-8 space-y-2">
                        {replies.map((reply) => (
                          <div key={reply.id} className="flex gap-2">
                            <Avatar
                              name={reply.authorName}
                              avatarUrl={reply.authorAvatarUrl}
                              avatarMediaId={reply.authorAvatarMediaId}
                              size="xs"
                            />
                            <div className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                                  {reply.authorName}
                                </span>
                                <span className="text-[11px] text-zinc-400">
                                  {formatRelativeTime(reply.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-700 dark:text-zinc-200 mt-0.5 break-words">
                                {reply.replyToAuthorName && (
                                  <span className="text-blue-600 dark:text-blue-400 font-medium mr-1">
                                    @{reply.replyToAuthorName}
                                  </span>
                                )}
                                {reply.text}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {replyTarget && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-700 dark:text-blue-300">
              <span className="flex items-center gap-1.5 truncate">
                <CornerDownRight className="w-3.5 h-3.5 shrink-0" />
                Replying to {replyTarget.authorName}
              </span>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="font-medium hover:underline shrink-0 ml-2"
              >
                Cancel
              </button>
            </div>
          )}

          <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
            <input
              type="text"
              maxLength={1500}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                replyTarget
                  ? `Reply to ${replyTarget.authorName}...`
                  : 'Write a comment...'
              }
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={!commentText.trim() || submittingComment}
              aria-label="Send comment"
              className="min-h-[42px] min-w-[42px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-45 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </article>
  );
};
