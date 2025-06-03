"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ProcessingLoaderProps {
  title?: string;
  status: string;
  progress?: number;
  showProgress?: boolean;
  variant?: 'card' | 'inline';
}

export function YouTubeProcessingLoader({ status }: { status: string }) {
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

export function MediaProcessingLoader({
  title = "Processing Media",
  status,
  progress = 0,
  showProgress = true,
  variant = 'card'
}: ProcessingLoaderProps) {
  if (variant === 'inline') {
    return (
      <div className="p-4 border border-primary/20 rounded-lg bg-primary/5">
        <div className="flex flex-col items-center space-y-3">
          <div className="flex justify-center space-x-1">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
          <p className="text-sm text-muted-foreground text-center">{status}</p>
          {showProgress && (
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium text-primary">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="shadow-lg border-border">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <h3 className="text-lg font-semibold text-primary">{title}</h3>
          </div>
          {showProgress && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {status || "Initializing..."}
                </span>
                <span className="text-sm font-medium text-primary">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          {!showProgress && (
            <div className="flex flex-col items-center space-y-3">
              <div className="flex justify-center space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <p className="text-sm text-muted-foreground text-center">{status}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
