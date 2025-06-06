import { useCallback, useEffect, useRef } from 'react';

// Mobile device detection function (reused from mobile viewport hook)
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

export function useAutoResizeTextarea() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !isMobileDevice()) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Calculate the new height based on content
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 96; // min-h-24 = 6rem = 96px
    const maxHeight = 200; // Reasonable max height for mobile

    // Set the height to fit content, respecting min and max
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;

    // If content exceeds max height, enable scrolling
    if (scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }, []);

  // Effect to set up the textarea for auto-resize on mobile
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (isMobileDevice()) {
      // On mobile: disable resize and enable auto-expand
      textarea.style.resize = 'none';
      textarea.style.overflowY = 'hidden';

      // Initial height adjustment
      adjustHeight();

      // Add event listeners for auto-resize
      textarea.addEventListener('input', adjustHeight);
      textarea.addEventListener('focus', adjustHeight);

      // Handle window resize (orientation change)
      const handleResize = () => {
        setTimeout(adjustHeight, 100); // Small delay for orientation change
      };
      window.addEventListener('resize', handleResize);

      return () => {
        textarea.removeEventListener('input', adjustHeight);
        textarea.removeEventListener('focus', adjustHeight);
        window.removeEventListener('resize', handleResize);
      };
    } else {
      // On desktop: ensure resize handles are available
      textarea.style.resize = 'vertical';
      textarea.style.overflowY = 'auto';
    }
  }, [adjustHeight]);

  // Manual trigger for height adjustment (useful for programmatic content changes)
  const triggerResize = useCallback(() => {
    if (isMobileDevice()) {
      setTimeout(adjustHeight, 0);
    }
  }, [adjustHeight]);

  return {
    textareaRef,
    triggerResize,
    isMobile: isMobileDevice()
  };
}
