"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMenuOpen &&
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const isActive = (path: string) => {
    return pathname === path;
  };

  const linkClass = (path: string, isMobile = false) => {
    const baseClass = isMobile 
      ? "block px-4 py-2 hover:bg-gray-100" 
      : "underline hover:text-black";
    const activeClass = isMobile 
      ? "bg-[#4B4DB3]/5 text-[#4B4DB3]" 
      : "text-[#4B4DB3]";
    const inactiveClass = isMobile 
      ? "text-neutral-600" 
      : "text-neutral-600";
    
    return `${baseClass} ${isActive(path) ? activeClass : inactiveClass}`;
  };

  return (
    <nav className="relative flex items-center justify-between">
      <Link
        href="/"
        className="flex items-center gap-3 text-inherit no-underline"
      >
        <Image src="/logo.svg" alt="react-scan-logo" width={30} height={30} />
        <h3>
          <strong className="text-xl">React Scan</strong>
        </h3>
      </Link>

      <button
        ref={buttonRef}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="md:hidden p-2 hover:bg-gray-100 rounded-md"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isMenuOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      <div className="hidden md:flex gap-4">
        <Link
          href="/monitoring"
          className={linkClass('/monitoring')}
        >
          monitoring
        </Link>
        <Link
          href="/replay"
          className={linkClass('/replay')}
        >
          replay
        </Link>
        <Link
          href="https://github.com/aidenybai/react-scan#readme"
          className="text-neutral-600 underline hover:text-black"
          target="_blank"
          rel="noopener noreferrer"
        >
          docs ↗
        </Link>
        <Link
          href="https://github.com/aidenybai/react-scan"
          className="text-neutral-600 underline hover:text-black"
          target="_blank"
          rel="noopener noreferrer"
        >
          source ↗
        </Link>
      </div>

      {isMenuOpen && (
        <div 
          ref={menuRef}
          className="absolute right-0 top-[calc(100%+0.5rem)] w-48 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden md:hidden z-[100]"
        >
          <div className="divide-y divide-gray-100">
            <Link
              href="/monitoring"
              className={linkClass('/monitoring', true)}
              onClick={() => setIsMenuOpen(false)}
            >
              monitoring
            </Link>
            <Link
              href="/replay"
              className={linkClass('/replay', true)}
              onClick={() => setIsMenuOpen(false)}
            >
              replay
            </Link>
            <Link
              href="https://github.com/aidenybai/react-scan#readme"
              className="block px-4 py-2 text-neutral-600 hover:bg-gray-100"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsMenuOpen(false)}
            >
              <div className="flex items-center justify-between">
                <span>docs</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </Link>
            <Link
              href="https://github.com/aidenybai/react-scan"
              className="block px-4 py-2 text-neutral-600 hover:bg-gray-100"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsMenuOpen(false)}
            >
              <div className="flex items-center justify-between">
                <span>source</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
