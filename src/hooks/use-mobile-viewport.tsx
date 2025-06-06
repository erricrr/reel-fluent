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

    // Smooth mobile viewport reset - minimize visual disruption
    setTimeout(() => {
      // Strategy 1: Gentle viewport reset using CSS transforms (invisible to user)
      const body = document.body;
      const originalTransform = body.style.transform;

      // Apply a minimal, invisible transform to trigger layout recalculation
      body.style.transform = 'translateZ(0)';

      // Use requestAnimationFrame for smooth timing
      requestAnimationFrame(() => {
        // Reset transform after one frame
        body.style.transform = originalTransform;

        // Strategy 2: Gentle resize event (only if really needed)
        // Only dispatch resize if viewport seems stuck
        const currentWidth = window.innerWidth;
        const expectedWidth = window.screen.width;

        if (Math.abs(currentWidth - expectedWidth) > 50) {
          // Viewport seems zoomed, gentle reset needed
          setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
          }, 50);
        }
      });

    }, 300); // Longer delay to ensure keyboard is fully dismissed
  }, []);

  // Global listener for viewport changes that might indicate keyboard dismissal
  useEffect(() => {
    if (!isMobileDevice()) return;

    let initialViewportHeight = window.visualViewport?.height || window.innerHeight;

    const handleViewportChange = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight;

      // If viewport height increased significantly, keyboard was likely dismissed
      // Use a higher threshold to avoid false triggers
      if (currentHeight > initialViewportHeight * 1.2) {
        setTimeout(() => {
          resetMobileViewport();
        }, 150);
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
