import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { Camera, Check, Loader2, MapPin, Shield, X } from 'lucide-react';
import { uploadMediaToFirestore } from '../lib/mediaCache';
import { compressImageToJpegBase64, normalizeUsername } from '../lib/utils';
import { checkUsernameAvailable, savePublicProfile } from '../lib/zynkoApi';
import { PublicProfile, RequestPolicy } from '../types/zynko';
import { Avatar } from './MediaRenderer';

interface ProfileSetupModalProps {
  firebaseUser: User;
  existingProfile?: PublicProfile | null;
  onComplete: () => void;
  onCancel?: () => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({
  firebaseUser,
  existingProfile,
  onComplete,
  onCancel,
}) => {
  const isEditing = Boolean(existingProfile);
  const [name, setName] = useState(
    existingProfile?.name || firebaseUser.displayName || ''
  );
  const [username, setUsername] = useState(
    existingProfile?.username ||
      normalizeUsername((firebaseUser.email || '').split('@')[0] || '')
  );
  const [bio, setBio] = useState(existingProfile?.bio || '');
  const [location, setLocation] = useState(existingProfile?.location || '');
  const [whoCanSendRequests, setWhoCanSendRequests] = useState<RequestPolicy>(
    existingProfile?.whoCanSendRequests || 'EVERYONE'
  );
  const [avatarMediaId, setAvatarMediaId] = useState(
    existingProfile?.avatarMediaId || ''
  );
  const [avatarUrl, setAvatarUrl] = useState(
    existingProfile?.avatarUrl || firebaseUser.photoURL || ''
  );
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameValid, setUsernameValid] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const clean = username.trim();
    if (clean.length < 3) {
      setUsernameValid(null);
      return;
    }
    if (
      existingProfile &&
      clean.toLowerCase() === existingProfile.usernameLower
    ) {
      setUsernameValid(true);
      return;
    }
    let active = true;
    setCheckingUsername(true);
    const timer = setTimeout(async () => {
      const ok = await checkUsernameAvailable(clean, firebaseUser.uid);
      if (active) {
        setUsernameValid(ok);
        setCheckingUsername(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [username, firebaseUser.uid, existingProfile]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setError('');
    try {
      const base64 = await compressImageToJpegBase64(file, 512, 0.8);
      const mediaId = await uploadMediaToFirestore(
        firebaseUser.uid,
        'image/jpeg',
        base64
      );
      setAvatarMediaId(mediaId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (name.trim().length < 2) {
      setError('Please enter your display name (at least 2 characters).');
      return;
    }
    const cleanUser = normalizeUsername(username);
    if (cleanUser.length < 3) {
      setError('Username must be at least 3 characters (letters, numbers, . or _).');
      return;
    }
    if (usernameValid === false) {
      setError('That username is already taken.');
      return;
    }

    setSaving(true);
    try {
      await savePublicProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: name.trim(),
        username: cleanUser,
        bio,
        location,
        avatarUrl,
        avatarMediaId,
        coverMediaId: existingProfile?.coverMediaId || '',
        whoCanSendRequests,
        previousUsernameLower: existingProfile?.usernameLower,
        isNewProfile: !isEditing,
      });
      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-xl text-zinc-900 dark:text-zinc-50">
              {isEditing ? 'Edit Profile' : 'Complete Your Zynko Profile'}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isEditing
                ? 'Changes sync immediately with the Android app.'
                : 'Choose your username and customize how others find you.'}
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar
              name={name || 'Zynko'}
              avatarUrl={avatarUrl}
              avatarMediaId={avatarMediaId}
              size="lg"
            />
            <div className="space-y-1.5">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer min-h-[40px]">
                {uploadingAvatar ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <span>{uploadingAvatar ? 'Uploading...' : 'Change Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
              <p className="text-[11px] text-zinc-400">
                Compressed JPEG stored in Firestore media.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Display Name
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Rahman"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                @
              </span>
              <input
                type="text"
                required
                maxLength={30}
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                placeholder="alex_r"
                className="w-full pl-8 pr-10 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingUsername ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                ) : usernameValid === true ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : usernameValid === false ? (
                  <X className="w-4 h-4 text-red-500" />
                ) : null}
              </div>
            </div>
            {usernameValid === false && (
              <p className="text-xs text-red-500">Username is already taken.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Bio
            </label>
            <textarea
              rows={2}
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a little about yourself..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                Location
              </label>
              <input
                type="text"
                maxLength={80}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Dhaka, BD"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <Shield className="w-3.5 h-3.5 text-zinc-400" />
                Friend Requests
              </label>
              <select
                value={whoCanSendRequests}
                onChange={(e) => setWhoCanSendRequests(e.target.value as RequestPolicy)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="EVERYONE">Everyone</option>
                <option value="FRIENDS_OF_FRIENDS">Friends of Friends</option>
                <option value="NOBODY">Nobody</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || uploadingAvatar || usernameValid === false}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium text-sm transition-colors cursor-pointer"
          >
            {saving ? 'Saving Profile...' : isEditing ? 'Save Changes' : 'Start Using Zynko'}
          </button>
        </form>
      </div>
    </div>
  );
};
