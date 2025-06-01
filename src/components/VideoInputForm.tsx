"use client";

import type * as React from 'react';
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, Link as LinkIcon, FileVideo, FileAudio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VideoInputFormProps {
  onSourceLoad: (source: { file?: File; url?: string }) => void;
  isLoading: boolean;
}

export default function VideoInputForm({ onSourceLoad, isLoading }: VideoInputFormProps) {
  const [inputType, setInputType] = useState<"url" | "file">("file");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draggedFileType, setDraggedFileType] = useState<'video' | 'audio' | null>(null);

  const processFile = (file: File | null | undefined) => {
    if (!file) return;
    const isValid = file.type.startsWith("video/") || file.type.startsWith("audio/");
    if (isValid) {
      onSourceLoad({ file });
    } else {
      toast({
        variant: "destructive",
        title: "Invalid File Type",
        description: "Please upload a valid video or audio file (e.g., mp4, mp3, wav, ogg).",
      });
    }
    // Always reset file input so selecting the same file again will trigger change
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
        onSourceLoad({ url });
        setUrl("");
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
      const items = event.dataTransfer.items;
      if (items && items.length > 0) {
        const itemType = items[0].type;
        if (itemType.startsWith('video/')) {
          setDraggedFileType('video');
        } else if (itemType.startsWith('audio/')) {
          setDraggedFileType('audio');
        } else {
          setDraggedFileType(null);
        }
      }
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    setDraggedFileType(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    setDraggedFileType(null);
    if (isLoading) return;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const items = event.dataTransfer.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].webkitGetAsEntry?.()?.isDirectory) {
          toast({
            variant: "destructive",
            title: "Folder Upload Not Supported",
            description: "Please drag and drop a single video or audio file, not a folder.",
          });
          return;
        }
      }
      processFile(files[0]);
       if (fileInputRef.current) {
        fileInputRef.current.files = files;
      }
    }
  };

  const renderDragIcon = () => {
    if (draggedFileType === 'audio') {
      return <FileAudio className={cn("h-12 w-12", isDraggingOver ? "text-primary" : "text-muted-foreground")} />;
    }
    return <FileVideo className={cn("h-12 w-12", isDraggingOver ? "text-primary" : "text-muted-foreground")} />;
  };

  return (
    <Tabs
      value={inputType}
      onValueChange={(value) => setInputType(value as "url" | "file")}
      className="w-full transition-all duration-300"
    >
      <TabsList className="grid w-full grid-cols-2 mb-4 transition-all duration-300">
        <TabsTrigger value="file" className="transition-all duration-300">
          <UploadCloud className="mr-2 h-4 w-4" />Upload File
        </TabsTrigger>
        <TabsTrigger value="url" className="transition-all duration-300">
          <LinkIcon className="mr-2 h-4 w-4" />From URL
        </TabsTrigger>
      </TabsList>
      <TabsContent value="file">
        <div
          className={cn(
            "space-y-3 border-2 border-dashed rounded-lg p-4 sm:p-6 transition-all duration-300",
            isDraggingOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
            isLoading && "cursor-not-allowed opacity-70"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center space-y-2 text-center transition-all duration-300">
            {renderDragIcon()}
            <Label
              htmlFor="media-file-upload"
              className={cn(
                "text-base sm:text-lg font-medium transition-all duration-300",
                isLoading ? "cursor-not-allowed": "cursor-pointer"
              )}
            >
              Drag & drop a video or audio file here, or click to select
            </Label>
            <Input
              id="media-file-upload"
              type="file"
              accept="video/*,audio/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              disabled={isLoading}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="transition-all duration-300"
            >
              Browse Files
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground text-center transition-all duration-300">
            Video and audio files will be divided into short clips (configurable length). Max 1 file.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="url">
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label
              htmlFor="video-url-input"
              className="text-base sm:text-lg transition-all duration-300"
            >
              YouTube or direct video file URL
            </Label>
            <Input
              id="video-url-input"
              type="url"
              placeholder="https://www.youtube.com/watch?v=... or https://example.com/video.mp4"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              className="transition-all duration-300"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="w-full sm:w-auto transition-all duration-300"
          >
            {isLoading ? "Loading..." : "Load Media from URL"}
          </Button>
          <p className="text-xs sm:text-sm text-muted-foreground transition-all duration-300">
            Supports YouTube and direct media links (MP3, WAV, MP4, WebM). Format support may vary by browser. YouTube audio is extracted only for language learning.
          </p>
        </form>
      </TabsContent>
    </Tabs>
  );
}
