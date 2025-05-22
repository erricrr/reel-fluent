"use client";

import type * as React from 'react';
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadCloud, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VideoInputFormProps {
  onVideoLoad: (source: { file?: File; url?: string }) => void;
  isLoading: boolean;
}

export default function VideoInputForm({ onVideoLoad, isLoading }: VideoInputFormProps) {
  const [inputType, setInputType] = useState<"url" | "file">("file");
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith("video/")) {
        onVideoLoad({ file });
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload a valid video file.",
        });
        if(fileInputRef.current) {
          fileInputRef.current.value = ""; // Reset file input
        }
      }
    }
  };

  const handleUrlSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (url.trim()) {
      // Basic URL validation (more robust validation can be added)
      try {
        new URL(url); // Check if it's a valid URL format
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

  return (
    <Tabs value={inputType} onValueChange={(value) => setInputType(value as "url" | "file")} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="file"><UploadCloud className="mr-2 h-4 w-4" />Upload File</TabsTrigger>
        <TabsTrigger value="url"><LinkIcon className="mr-2 h-4 w-4" />From URL</TabsTrigger>
      </TabsList>
      <TabsContent value="file">
        <div className="space-y-2">
          <Label htmlFor="video-file-upload">Upload a video file</Label>
          <Input
            id="video-file-upload"
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            disabled={isLoading}
            className="cursor-pointer file:text-primary file:font-semibold hover:file:bg-primary/10"
          />
          <p className="text-xs text-muted-foreground">
            Your video will be processed locally in your browser.
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
