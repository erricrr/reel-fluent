"use client";

interface ProcessingLoaderProps {
  status: string;
}

// Unified loader for all media processing
export function MediaProcessingLoader({ status }: ProcessingLoaderProps) {
  return (
    <div className="mt-4 transition-all duration-300 ease-in-out">
      <div className="p-4 border border-primary/20 rounded-lg bg-primary/5">
        <div className="flex flex-col items-center space-y-3">
          <div className="flex justify-center space-x-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-sm text-muted-foreground text-center">{status}</p>
        </div>
      </div>
    </div>
  );
}
