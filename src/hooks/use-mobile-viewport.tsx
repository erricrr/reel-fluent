import { useCallback, useEffect } from 'react';

// Mobile device detection function
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  // More strict mobile detection - must have mobile user agent
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

  // Additional check: must not be a desktop browser (even if touch enabled)
  const isDesktopBrowser = /windows nt|macintosh|linux/i.test(userAgent) && !/mobile/i.test(userAgent);

  // Only consider it mobile if it has mobile user agent AND is not a desktop browser
  return isMobileUA && !isDesktopBrowser && window.innerWidth < 768;
};

export function useMobileViewportReset() {
  const resetMobileViewport = useCallback(() => {
    if (!isMobileDevice()) return; // Only run on actual mobile devices

    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && typeof activeElement.blur === 'function') {
      activeElement.blur(); // Dismiss keyboard
    }

    // Conservative mobile viewport reset - only essential fixes
    setTimeout(() => {
      // Strategy 1: Force viewport meta tag refresh (most important for mobile)
      const viewport = document.querySelector("meta[name=viewport]");
      if (viewport) {
        const originalContent = viewport.getAttribute("content") || "width=device-width, initial-scale=1";
        // Temporarily change viewport to force browser recalculation
        viewport.setAttribute("content", "width=device-width, initial-scale=1.01");

        setTimeout(() => {
          viewport.setAttribute("content", originalContent);
          // Single resize event after viewport reset
          window.dispatchEvent(new Event('resize'));
        }, 100);
      }

      // Strategy 2: Force body style recalculation (helps with layout)
      document.body.style.minHeight = '100vh';
      setTimeout(() => {
        document.body.style.minHeight = '';
      }, 50);

    }, 200); // Delay to ensure keyboard is fully dismissed
  }, []);

  // Global listener for viewport changes that might indicate keyboard dismissal
  useEffect(() => {
    if (!isMobileDevice()) return;

    let initialViewportHeight = window.visualViewport?.height || window.innerHeight;

    const handleViewportChange = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight;

      // If viewport height increased significantly, keyboard was likely dismissed
      if (currentHeight > initialViewportHeight * 1.1) {
        setTimeout(() => {
          resetMobileViewport();
        }, 100);
      }

      initialViewportHeight = currentHeight;
    };

    // Listen for visual viewport changes (better for keyboard detection)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
    } else {
      // Fallback for older browsers
      window.addEventListener('resize', handleViewportChange);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      } else {
        window.removeEventListener('resize', handleViewportChange);
      }
    };
  }, [resetMobileViewport]);

  return resetMobileViewport;
}
