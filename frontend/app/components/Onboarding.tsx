'use client';

import { useState } from 'react';

interface OnboardingProps {
  onComplete: (name: string, type: 'movie' | 'series') => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [name, setName] = useState('');
  const [contentType, setContentType] = useState<'movie' | 'series' | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!contentType) {
      setError('Please select movie or series');
      return;
    }

    setError('');
    onComplete(name.trim(), contentType);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 text-white tracking-tight">Rudhra</h1>
          <p className="text-gray-500 text-xl font-light">Watch together in real time</p>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Name Input */}
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 uppercase tracking-wider">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder="Enter your name"
                className="w-full px-4 py-3.5 bg-black border border-zinc-800 rounded-lg text-white placeholder-gray-600 focus:border-white focus:outline-none focus:ring-0 transition-all duration-200 text-lg"
                autoFocus
              />
            </div>

            {/* Content Type Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300 uppercase tracking-wider">
                What would you like to watch?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setContentType('movie');
                    setError('');
                  }}
                  className={`px-6 py-4 rounded-lg border-2 transition-all duration-200 text-base font-medium ${
                    contentType === 'movie'
                      ? 'border-white bg-white text-black'
                      : 'border-zinc-700 bg-zinc-950 text-white hover:border-zinc-600 hover:bg-zinc-900'
                  }`}
                >
                  Movie
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setContentType('series');
                    setError('');
                  }}
                  className={`px-6 py-4 rounded-lg border-2 transition-all duration-200 text-base font-medium ${
                    contentType === 'series'
                      ? 'border-white bg-white text-black'
                      : 'border-zinc-700 bg-zinc-950 text-white hover:border-zinc-600 hover:bg-zinc-900'
                  }`}
                >
                  Series
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 transition-all duration-200 text-base uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!name.trim() || !contentType}
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
