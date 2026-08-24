'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getInstallPlatform,
  isStandaloneDisplay,
  isTauriRuntime,
  type InstallPlatform,
} from '@/lib/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const subscribeToClient = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18.5h14" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current">
      <path
        d="M12 15V3m0 0L8 7m4-4 4 4M6 10H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-current">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function InstallInstructions({
  platform,
  onClose,
}: {
  platform: InstallPlatform;
  onClose(): void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const isIos = platform === 'ios';

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-end bg-[#071116]/70 p-3 backdrop-blur-sm sm:place-items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-parlour-title"
        className="panel-soft w-full max-w-md rounded-[1.8rem] p-5 text-left shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local PWA icon is already optimized */}
          <img src="/icon-192.png" alt="" className="h-14 w-14 shrink-0 rounded-2xl shadow-lg" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-hearth-200">
              Keep a seat ready
            </p>
            <h2
              id="install-parlour-title"
              className="font-display text-2xl font-extrabold text-dusk-50"
            >
              Add parlour to your home screen
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dusk-200/20 bg-dusk-950/35 text-2xl text-dusk-100 transition hover:bg-dusk-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hearth-200"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-dusk-100/85">
          It opens full-screen, works offline for solo play, and stays right beside your other apps.
        </p>

        <ol className="mt-5 space-y-3">
          <li className="flex items-center gap-3 rounded-2xl border border-dusk-200/15 bg-dusk-950/30 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dusk-800/70 text-hearth-200">
              {isIos ? <ShareIcon /> : <MenuIcon />}
            </span>
            <span className="text-sm text-dusk-50">
              <strong className="font-display">1.</strong>{' '}
              {isIos ? 'Tap Share in your browser toolbar.' : 'Open your browser menu.'}
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl border border-dusk-200/15 bg-dusk-950/30 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-dusk-800/70 font-display text-2xl font-bold text-hearth-200">
              +
            </span>
            <span className="text-sm text-dusk-50">
              <strong className="font-display">2.</strong> Choose{' '}
              <span className="font-bold">
                {isIos ? 'Add to Home Screen' : 'Install app or Add to Home screen'}
              </span>
              .
            </span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl border border-dusk-200/15 bg-dusk-950/30 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hearth-300 font-display font-extrabold text-[#43200a]">
              ✓
            </span>
            <span className="text-sm text-dusk-50">
              <strong className="font-display">3.</strong> Confirm with{' '}
              <span className="font-bold">Add</span> or <span className="font-bold">Install</span>.
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}

export function PwaInstall() {
  const clientReady = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedOverride, setInstalledOverride] = useState<boolean | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const platform = clientReady ? getInstallPlatform(navigator) : 'other';
  const installed =
    installedOverride ?? (clientReady ? isStandaloneDisplay() || isTauriRuntime() : true);

  useEffect(() => {
    if (!clientReady) return;
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const updateInstalledState = () =>
      setInstalledOverride(isStandaloneDisplay() || isTauriRuntime());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstalledOverride(false);
    };
    const onAppInstalled = () => {
      setInstalledOverride(true);
      setInstallPrompt(null);
      setInstructionsOpen(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    displayMode?.addEventListener?.('change', updateInstalledState);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      displayMode?.removeEventListener?.('change', updateInstalledState);
    };
  }, [clientReady]);

  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);

  if (installed || (!installPrompt && platform === 'other')) return null;

  const handleInstall = async () => {
    if (!installPrompt) {
      setInstructionsOpen(true);
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setInstalledOverride(true);
  };

  const label = installPrompt ? 'Install app' : 'Add to Home Screen';

  return (
    <>
      <button
        type="button"
        data-testid="pwa-install"
        onClick={() => void handleInstall()}
        aria-haspopup={installPrompt ? undefined : 'dialog'}
        aria-expanded={installPrompt ? undefined : instructionsOpen}
        className="group mt-1 inline-flex min-h-11 items-center gap-2 rounded-full border border-hearth-200/35 bg-dusk-950/45 px-4 py-2 font-display text-sm font-bold text-hearth-100 shadow-lg backdrop-blur-sm transition duration-150 ease-pop hover:-translate-y-0.5 hover:border-hearth-200/65 hover:bg-dusk-950/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hearth-200"
      >
        <DownloadIcon />
        <span>{label}</span>
        <span
          aria-hidden="true"
          className="text-dusk-200 transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </button>

      {instructionsOpen ? (
        <InstallInstructions platform={platform} onClose={closeInstructions} />
      ) : null}
    </>
  );
}

export default PwaInstall;
