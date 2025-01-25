'use client';

import { useRef, useState, useEffect } from 'react';

export default function ReplayPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }, 300);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isModalOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to join waitlist');
      }

      setEmail('');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error joining waitlist:', error);
      setShowError(true);
      setTimeout(() => setShowError(false), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mt-8 space-y-6">
        <div>
          <span className="font-bold">Replay for React Scan</span> saves clips of your website when performance drops, and provides a breakdown of what happened
        </div>

        <div className="relative">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:gap-0">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-white border sm:border-r-0 border-gray-200 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#4B4DB3] focus:ring-2 focus:ring-[#4B4DB3]/20"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="relative px-6 py-2.5 bg-[#4B4DB3] text-white font-medium hover:bg-[#3F41A0] transition-colors whitespace-nowrap border border-[#4B4DB3] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              <span className={`transition-opacity duration-200 ${isSubmitting ? 'opacity-0' : 'opacity-100'}`}>
                Join Waitlist
              </span>
              {isSubmitting && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              )}
            </button>
          </form>

          <div className={`absolute inset-x-0 -top-12 transition-all duration-500 ${showSuccess ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <div className="flex items-center justify-center">
              <div className="bg-white border border-[#4B4DB3]/20 shadow-lg text-[#4B4DB3] px-4 py-2 rounded-full font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{"You're on the waitlist!"}</span>
                <span className="animate-bounce inline-block">🎉</span>
              </div>
            </div>
          </div>

          <div className={`absolute inset-x-0 -top-12 transition-all duration-500 ${showError ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
            <div className="flex items-center justify-center">
              <div className="bg-white border border-red-500/20 shadow-lg text-red-500 px-4 py-2 rounded-full font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Error joining waitlist</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-500">Watch the demo below to see how it works.</p>

        <div className="relative w-full aspect-video">
          <div className="absolute inset-0 bg-black/[0.02] rounded-xl backdrop-blur-sm">
            <div className="relative overflow-hidden group cursor-pointer h-full" onClick={() => setIsModalOpen(true)}>
              <div className="relative pb-[56.25%]">
                <div className="absolute inset-0">
                <video
                  className="w-full h-full object-cover"
                  src="/player-video.mp4"
                  playsInline
                  muted
                  preload="metadata"
                  poster="/thumbnail.png"
                />
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                    <div className="h-16 w-16 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center transform group-hover:scale-105 transition-all duration-300 group-hover:bg-white">
                      <svg className="w-7 h-7 text-gray-900 relative left-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto pt-8 pb-16"
          onClick={closeModal}
          style={{ 
            opacity: 0,
            animation: isClosing 
              ? 'fadeOut 300ms ease-in-out forwards'
              : 'fadeIn 300ms ease-in-out forwards',
          }}
        >
          <div 
            className="w-[95vw] md:w-[80vw] max-h-[90vh] relative" 
            onClick={e => e.stopPropagation()}
            style={{ 
              opacity: 0,
              transform: 'scale(0.95)',
              animation: isClosing
                ? 'scaleOut 300ms ease-in-out forwards'
                : 'scaleIn 300ms ease-in-out forwards',
            }}
          >
            <style jsx>{`
              @keyframes fadeIn {
                from { opacity: 0; backdrop-filter: blur(0); background: rgba(0, 0, 0, 0); }
                to { opacity: 1; backdrop-filter: blur(4px); background: rgba(0, 0, 0, 0.4); }
              }
              @keyframes fadeOut {
                from { opacity: 1; backdrop-filter: blur(4px); background: rgba(0, 0, 0, 0.4); }
                to { opacity: 0; backdrop-filter: blur(0); background: rgba(0, 0, 0, 0); }
              }
              @keyframes scaleIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
              }
              @keyframes scaleOut {
                from { opacity: 1; transform: scale(1); }
                to { opacity: 0; transform: scale(0.95); }
              }
            `}</style>
            <div className="bg-black rounded-lg border border-white/10 shadow-2xl flex flex-col overflow-hidden">
              <div className="hidden sm:flex justify-end px-3 py-2 bg-white border-b border-[#4B4DB3]/10">
                <button
                  onClick={closeModal}
                  className="h-7 w-7 rounded-md hover:bg-[#4B4DB3]/5 flex items-center justify-center transition-colors"
                >
                  <svg className="w-4 h-4 text-[#4B4DB3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <button
                onClick={closeModal}
                className="sm:hidden absolute right-3 top-3 z-10 h-8 w-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="bg-black">
                <video
                  ref={videoRef}
                  className="w-full"
                  src="/player-video.mp4"
                  controls
                  autoPlay
                  playsInline
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
