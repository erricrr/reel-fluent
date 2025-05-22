
"use client";

import type * as React from 'react';
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, Link as LinkIcon, FileVideo } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VideoInputFormProps {
  onVideoLoad: (source: { file?: File; url?: string }) => void;
  isLoading: boolean;
}

export default function VideoInputForm({ onVideoLoad, isLoading }: VideoInputFormProps) {
  const [inputType, setInputType] = useState<"url" | "file">("file");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processFile = (file: File | null | undefined) => {
    if (file) {
      if (file.type.startsWith("video/")) {
        onVideoLoad({ file });
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload a valid video file.",
        });
        if (fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset file input
        }
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFile(event.target.files?.[0]);
  };

  const handleUrlSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim()) {
      try {
        new URL(url);
        onVideoLoad({ url });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Invalid URL",
          description: "Please enter a valid video URL.",
        });
      }
    } else {
      toast({
        variant: "destructive",
        title: "Empty URL",
        description: "Please enter a video URL.",
      });
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isLoading) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (isLoading) return;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      // Check if any dropped item is a directory
      const items = event.dataTransfer.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].webkitGetAsEntry?.()?.isDirectory) {
          toast({
            variant: "destructive",
            title: "Folder Upload Not Supported",
            description: "Please drag and drop a single video file, not a folder.",
          });
          return;
        }
      }
      processFile(files[0]); // Process the first file
       if (fileInputRef.current) {
        fileInputRef.current.files = files; // Assign to file input for consistency
      }
    }
  };

  return (
    <Tabs value={inputType} onValueChange={(value) => setInputType(value as "url" | "file")} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="file"><UploadCloud className="mr-2 h-4 w-4" />Upload File</TabsTrigger>
        <TabsTrigger value="url"><LinkIcon className="mr-2 h-4 w-4" />From URL</TabsTrigger>
      </TabsList>
      <TabsContent value="file">
        <div
          className={cn(
            "space-y-3 border-2 border-dashed rounded-lg p-6 transition-colors",
            isDraggingOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
            isLoading && "cursor-not-allowed opacity-70"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center space-y-2 text-center">
            <FileVideo className={cn("h-12 w-12", isDraggingOver ? "text-primary" : "text-muted-foreground")} />
            <Label htmlFor="video-file-upload" className={cn("text-lg font-medium", isLoading ? "cursor-not-allowed": "cursor-pointer")}>
              Drag & drop a video file here, or click to select
            </Label>
            <Input
              id="video-file-upload"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              disabled={isLoading}
              className="sr-only" // Hidden, triggered by label or drop
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className={cn(!isLoading && "hover:bg-primary/10")}
            >
              Browse Files
            </Button>
          </div>
           <p className="text-xs text-muted-foreground text-center">
            Your video will be processed locally in your browser. Max 1 file.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="url">
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="video-url-input">YouTube or direct video URL</Label>
            <Input
              id="video-url-input"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <Button type="submit" disabled={isLoading || !url.trim()} className="w-full sm:w-auto">
            {isLoading ? "Loading..." : "Load Video from URL"}
          </Button>
           <p className="text-xs text-muted-foreground">
            Note: Full functionality like transcription is best supported with uploaded files. YouTube links primarily for viewing.
          </p>
        </form>
      </TabsContent>
    </Tabs>
  );
}
