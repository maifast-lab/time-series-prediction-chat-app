'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  AuthClientError,
  decodeGoogleCredential,
  exchangeGoogleCredential,
  getCurrentAuthSession,
  getGoogleClientId,
  loadGoogleIdentityScript,
  signOut,
} from '@/lib/auth-client';
import { ApiClientError } from '@/lib/api-client';
import { useCreateChatMutation, useLatestChatQuery } from '@/lib/api-hooks';
export default function LoginPage() {
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const imageLogo = '/PNG.png';
  const [hasStoredAuth, setHasStoredAuth] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [googleReady, setGoogleReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const createChatMutation = useCreateChatMutation();
  const hasRedirectedToChatRef = useRef(false);
  const latestChatQuery = useLatestChatQuery({
    enabled: hasStoredAuth,
  });

  const createChatAndRedirect = useCallback(async () => {
    if (hasRedirectedToChatRef.current) {
      return;
    }

    hasRedirectedToChatRef.current = true;
    setAuthError('');

    try {
      if (!latestChatQuery.data) {
        const latestChatResult = await latestChatQuery.refetch();
        if (
          latestChatResult.data?.hasChat &&
          latestChatResult.data.chatId
        ) {
          window.location.assign(`/c/${latestChatResult.data.chatId}`);
          return;
        }
      } else if (
        latestChatQuery.data.hasChat &&
        latestChatQuery.data.chatId
      ) {
        window.location.assign(`/c/${latestChatQuery.data.chatId}`);
        return;
      }

      const chat = await createChatMutation.mutateAsync();
      window.location.assign(`/c/${chat._id}`);
    } catch {
      hasRedirectedToChatRef.current = false;
      setAuthError('Could not create a new chat. Please try again.');
      setCheckingAuth(false);
    }
  }, [createChatMutation, latestChatQuery]);

  useEffect(() => {
    let isMounted = true;

    async function checkExistingSession() {
      const authSession = await getCurrentAuthSession();

      if (!isMounted) {
        return;
      }

      if (authSession) {
        setHasStoredAuth(true);
      } else {
        setCheckingAuth(false);
      }
    }

    void checkExistingSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasStoredAuth) {
      return;
    }

    if (latestChatQuery.isSuccess) {
      const timeoutId = window.setTimeout(() => {
        void createChatAndRedirect();
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    if (latestChatQuery.isError) {
      const timeoutId = window.setTimeout(() => {
        if (
          latestChatQuery.error instanceof ApiClientError &&
          latestChatQuery.error.status === 401
        ) {
          void signOut();
        } else {
          setAuthError('Could not validate saved login.');
        }

        setCheckingAuth(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [
    createChatAndRedirect,
    hasStoredAuth,
    latestChatQuery.error,
    latestChatQuery.isError,
    latestChatQuery.isSuccess,
  ]);

  useEffect(() => {
    if (checkingAuth) {
      return;
    }
    async function setupGoogleLogin() {
      const clientId = getGoogleClientId();
      if (!clientId) {
        setAuthError('Google Client ID is missing.');
        return;
      }
      try {
        await loadGoogleIdentityScript();

        if (!window.google?.accounts?.id || !googleButtonRef.current) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: async (response) => {
            if (!response.credential) {
              setAuthError('Google login failed.');
              return;
            }

            setSigningIn(true);
            setAuthError('');

            try {
              const profile = decodeGoogleCredential(response.credential);
              await exchangeGoogleCredential(response.credential, profile);
              const authSession = await getCurrentAuthSession();

              if (!authSession) {
                throw new AuthClientError('Could not validate login session.', 401);
              }

              setHasStoredAuth(true);
              await createChatAndRedirect();
            } catch (error) {
              setAuthError(
                error instanceof AuthClientError
                  ? error.message
                  : 'Google login failed. Please try again.',
              );
            } finally {
              setSigningIn(false);
            }
          },
        });

        googleButtonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 320,
        });

        setGoogleReady(true);
      } catch {
        setAuthError('Could not load Google sign-in.');
      }
    }
    void setupGoogleLogin();
  }, [checkingAuth, createChatAndRedirect]);
  return (
    <main className='flex min-h-screen items-center justify-center px-4 py-10'>
      <Card className='w-full max-w-xl rounded-[32px] border border-white/70 bg-white/90 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75 dark:shadow-black/20'>
        <CardHeader className='items-center justify-center space-y-5 px-6 pt-8 text-center sm:px-8 sm:pt-10'>
          <div className='relative flex w-full justify-center'>
            <Image
              src={imageLogo}
              alt='Maifast Logo'
              width={200}
              height={200}
              className='mx-auto'
            />
          </div>
          <div className='space-y-2'>
            <CardTitle className='text-3xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-4xl'>
              Welcome back
            </CardTitle>
            <CardDescription className='text-base leading-7 text-slate-600 dark:text-slate-300'>
              Sign in with Google to access chats, uploads, and the shared data
              workspace.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className='space-y-5 px-6 pb-8 sm:px-8 sm:pb-10'>
          <Separator />

          <div className='flex justify-center'>
            <div ref={googleButtonRef} className='min-h-[44px] w-full max-w-[320px]' />
          </div>

          {!googleReady && !checkingAuth ? (
            <Button
              type='button'
              variant='outline'
              size='lg'
              className='w-full rounded-xl'
              onClick={() => window.location.reload()}
            >
              Reload Google sign-in
            </Button>
          ) : null}

          {checkingAuth ? (
            <p className='text-center text-sm text-slate-500 dark:text-slate-400'>
              Checking saved session...
            </p>
          ) : null}

          {signingIn ? (
            <p className='text-center text-sm text-slate-500 dark:text-slate-400'>
              Signing you in securely...
            </p>
          ) : null}

          {authError ? (
            <Alert variant='destructive' className='border-red-500/20 bg-red-500/5 text-center'>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
