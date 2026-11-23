import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { ArrowRight, Globe, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';

export const AuthGate: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (msg.includes('popup-closed-by-user')) {
        setError('Sign-in was cancelled. Click below to try again.');
      } else if (msg.includes('popup-blocked')) {
        setError('Your browser blocked the sign-in popup. Please allow popups for this site.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col justify-between">
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-display font-bold text-lg flex items-center justify-center">
            Z
          </div>
          <span className="font-display font-bold text-xl tracking-tight text-zinc-900 dark:text-zinc-50">
            Zynko
          </span>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Web &amp; Android Live Sync
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <h1 className="font-display font-bold text-4xl sm:text-5xl tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1] [text-wrap:balance]">
              Your social circle, synced across browser and Android.
            </h1>
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 max-w-xl leading-relaxed">
              Share photos and short videos, connect with friends, and chat in real time on the live Zynko network directly from Chrome or Safari.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1.5">
                <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Live Feed
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Featured moments, likes, threaded replies, and media.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1.5">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Friends &amp; Follow
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Manage friend requests, followers, and privacy controls.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 space-y-1.5">
                <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Messenger
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Instant 1-on-1 conversations with media attachments.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="space-y-2">
                <h2 className="font-display font-bold text-2xl text-zinc-900 dark:text-zinc-50">
                  Sign in to Zynko
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Use your Google account to access your profile, feed, and messages.
                </p>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5 shrink-0 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
                {!loading && <ArrowRight className="w-4 h-4 ml-auto" />}
              </button>

              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <ShieldCheck className="w-4 h-4 text-zinc-400 shrink-0" />
                <span>Authenticated via Firebase Auth and synced in real time.</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-6 py-4 text-xs text-zinc-400 dark:text-zinc-600 flex items-center justify-between">
        <span>Zynko Social</span>
        <span>Works on Chrome, Safari &amp; Android</span>
      </footer>
    </div>
  );
};
