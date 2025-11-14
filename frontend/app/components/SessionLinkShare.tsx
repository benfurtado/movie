'use client';

import { useState } from 'react';

interface SessionLinkShareProps {
  sessionLink: string;
  onAddVideo?: () => void;
}

export default function SessionLinkShare({ sessionLink, onAddVideo }: SessionLinkShareProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sessionLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const iconClasses =
    'w-5 h-5 text-white transition-colors duration-200';
  const actionButtonClasses =
    'w-10 h-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-colors';

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-white/90"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.172 7l-6.364 6.364m8.486-4.95a4 4 0 010 5.657l-1.414 1.414a4 4 0 01-5.657 0m-.707-6.364a4 4 0 010-5.657l1.414-1.414a4 4 0 015.657 0"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Session Link
          </div>
          <button
            onClick={handleCopy}
            className="w-full text-left text-sm text-white font-mono truncate hover:text-white/80 transition-colors"
            title="Copy session link"
          >
            {sessionLink}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={actionButtonClasses}
            title="Copy session link"
            aria-label="Copy session link"
          >
            {copied ? (
              <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8.25 7.5v-.75A2.25 2.25 0 0110.5 4.5h7.25A2.25 2.25 0 0120 6.75v7.25a2.25 2.25 0 01-2.25 2.25h-.75M6.75 8.25h7.5A2.25 2.25 0 0116.5 10.5v7.25a2.25 2.25 0 01-2.25 2.25h-7.5A2.25 2.25 0 014.5 17.75v-7.5A2.25 2.25 0 016.75 8.25z"
                />
              </svg>
            )}
          </button>
          {onAddVideo && (
            <button
              onClick={onAddVideo}
              className={actionButtonClasses}
              title="Add another video"
              aria-label="Add another video"
            >
              <svg className={iconClasses} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 5v14m7-7H5" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
