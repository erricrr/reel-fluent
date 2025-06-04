import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, FileDiff, Languages, Edit3, AlertTriangle } from "lucide-react";
import type { Clip } from '@/lib/videoUtils';
import type { CorrectionToken } from '@/ai/flows/compare-transcriptions-flow';
import MediaControls from './MediaControls';
import TranslationLanguageSelector from '../TranslationLanguageSelector';
import type { VideoPlayerRef } from "../VideoPlayer";
import { getLanguageLabel } from "@/lib/languageOptions";
import { useToast } from "@/hooks/use-toast";

// Inline utility component
const ThreeDotsLoader: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div className={`flex justify-center space-x-1 ${className}`}>
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
  </div>
);

interface AIToolsTabProps {
  currentClip: Clip;
  userTranscriptionInput: string;
  videoPlayerRef: React.RefObject<VideoPlayerRef>;
  effectiveClip: Clip;
  currentPlaybackTime: number;
  isCurrentClipPlaying: boolean;
  isLooping: boolean;
  setIsLooping: (value: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (value: number) => void;
  mediaSrc?: string;
  clipDisplayName: string;
  disableTextarea: boolean;
  translationTargetLanguage: string;
  setTranslationTargetLanguage: (language: string) => void;
  currentClipIndex: number;
  isLoadingMedia: boolean;
  isSavingMedia: boolean;
  isAnyClipTranscribing: boolean;
  isCurrentClipTranscribing?: boolean;
  isCurrentClipTranslating?: boolean;
  isCurrentClipComparing?: boolean;
  onTranscribeAudio: (clipId: string) => Promise<void>;
  onGetCorrections: (clipId: string) => Promise<void>;
  onTranslate: (clipId: string, targetLanguage: string) => Promise<void>;
  focusedClip?: Clip | null;
  isAudioSource?: boolean;
  aiToolsState: any; // Type this properly based on the hook return type
}

export default function AIToolsTab({
  currentClip,
  userTranscriptionInput,
  videoPlayerRef,
  effectiveClip,
  currentPlaybackTime,
  isCurrentClipPlaying,
  isLooping,
  setIsLooping,
  playbackRate,
  setPlaybackRate,
  mediaSrc,
  clipDisplayName,
  disableTextarea,
  translationTargetLanguage,
  setTranslationTargetLanguage,
  currentClipIndex,
  isLoadingMedia,
  isSavingMedia,
  isAnyClipTranscribing,
  isCurrentClipTranscribing,
  isCurrentClipTranslating,
  isCurrentClipComparing,
  onTranscribeAudio,
  onGetCorrections,
  onTranslate,
  focusedClip,
  isAudioSource,
  aiToolsState,
}: AIToolsTabProps) {

  const { toast } = useToast();
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceText, setPracticeText] = useState("");

  const handleTranscribeClip = useCallback(async () => {
    if (!currentClip || (isAudioSource && !mediaSrc)) {
      toast({
        variant: "destructive",
        title: "Cannot Transcribe",
        description: "Please ensure media is loaded and a clip is selected."
      });
      return;
    }

    aiToolsState.setAiToolsButtonClicked(true);
    aiToolsState.setUserActivelyUsingAITools(true);

    await aiToolsState.withAIToolsProtection(async () => {
      try {
        await onTranscribeAudio(currentClip.id);

        // Auto-save the result
        if (currentClip.automatedTranscription &&
            !currentClip.automatedTranscription.startsWith("Error:") &&
            currentClip.automatedTranscription !== "Transcribing...") {
          aiToolsState.handleAutoSave(currentClip.id, {
            automatedTranscription: currentClip.automatedTranscription,
            language: currentClip.language
          });
        }
      } catch (error) {
        console.warn("Transcription error:", error);
        toast({
          variant: "destructive",
          title: "Transcription Failed",
          description: "Failed to transcribe the clip. Please try again."
        });
      } finally {
        setTimeout(() => aiToolsState.setAiToolsButtonClicked(false), 2000);
      }
    });
  }, [currentClip, isAudioSource, mediaSrc, toast, onTranscribeAudio, aiToolsState]);

  const handleGetCorrections = useCallback(async () => {
    const comprehensiveData = aiToolsState.getComprehensiveTranscriptionData();

    if (!comprehensiveData.hasValidUserTranscription) {
      toast({
        variant: "destructive",
        title: "Missing User Transcription",
        description: "Please enter and save your transcription before comparing with AI."
      });
      return;
    }

    if (!comprehensiveData.hasValidAutomatedTranscription) {
      toast({
        variant: "destructive",
        title: "Missing AI Transcription",
        description: "Please ensure automated transcription is successful first."
      });
      return;
    }

    aiToolsState.setAiToolsButtonClicked(true);

    await aiToolsState.withAIToolsProtection(async () => {
      try {
        await onGetCorrections(currentClip.id);

        // Auto-save the result
        if (currentClip.comparisonResult &&
            Array.isArray(currentClip.comparisonResult) &&
            currentClip.comparisonResult.length > 0 &&
            currentClip.comparisonResult[0].token !== "Comparing..." &&
            !currentClip.comparisonResult[0].token.startsWith("Error:")) {
          aiToolsState.handleAutoSave(currentClip.id, {
            comparisonResult: currentClip.comparisonResult
          });
        }
      } catch (error) {
        console.warn("Corrections error:", error);
      } finally {
        setTimeout(() => aiToolsState.setAiToolsButtonClicked(false), 2000);
      }
    });
  }, [currentClip, onGetCorrections, toast, aiToolsState]);

  const handleTranslate = useCallback(async () => {
    const comprehensiveData = aiToolsState.getComprehensiveTranscriptionData();

    if (!comprehensiveData.hasValidAutomatedTranscription) {
      toast({
        variant: "destructive",
        title: "No Text to Translate",
        description: "Please ensure automated transcription is successful first."
      });
      return;
    }

    aiToolsState.setAiToolsButtonClicked(true);

    await aiToolsState.withAIToolsProtection(async () => {
      try {
        await onTranslate(currentClip.id, translationTargetLanguage);

        // Auto-save the result
        if (currentClip.translation &&
            !currentClip.translation.startsWith("Error:") &&
            currentClip.translation !== "Translating...") {
          aiToolsState.handleAutoSave(currentClip.id, {
            translation: currentClip.translation,
            translationTargetLanguage
          });
        } else if (currentClip.englishTranslation &&
                  !currentClip.englishTranslation.startsWith("Error:") &&
                  currentClip.englishTranslation !== "Translating...") {
          aiToolsState.handleAutoSave(currentClip.id, {
            englishTranslation: currentClip.englishTranslation,
            translationTargetLanguage: "english"
          });
        }
      } catch (error) {
        console.warn("Translation error:", error);
      } finally {
        setTimeout(() => aiToolsState.setAiToolsButtonClicked(false), 2000);
      }
    });
  }, [currentClip, translationTargetLanguage, onTranslate, toast, aiToolsState]);

  const getTranslationForCurrentTarget = (): string | null | undefined => {
    if (currentClip.translation !== undefined && currentClip.translationTargetLanguage === translationTargetLanguage) {
      return currentClip.translation;
    }

    if (translationTargetLanguage === 'english' && currentClip.englishTranslation !== undefined) {
      return currentClip.englishTranslation;
    }

    return null;
  };

  const renderCorrectionToken = (token: CorrectionToken, index: number) => {
    let userTokenStyle = "";
    let suggestionSpan: React.ReactNode = null;

    switch (token.status) {
      case 'correct':
        userTokenStyle = "text-green-600 dark:text-green-400";
        break;
      case 'incorrect':
        userTokenStyle = "text-red-600 dark:text-red-400 line-through";
        if (token.suggestion) {
          suggestionSpan = <span className="text-green-600 dark:text-green-400"> {token.suggestion}</span>;
        }
        break;
      case 'extra':
        userTokenStyle = "text-blue-600 dark:text-blue-400 opacity-80 italic";
        break;
      case 'missing':
        userTokenStyle = "text-gray-500 dark:text-gray-400 opacity-70";
        break;
      default:
        break;
    }

    let displayToken = token.token;
    if (token.status === 'extra') displayToken = `+${token.token}`;
    if (token.status === 'missing') displayToken = `[${token.token}]`;

    return (
      <span key={index}>
        <span className={userTokenStyle}>{displayToken}</span>
        {suggestionSpan}
        {' '}
      </span>
    );
  };

  // Derived state for UI
  const isAutomatedTranscriptionError = currentClip.automatedTranscription && currentClip.automatedTranscription.startsWith("Error:");
  const isAutomatedTranscriptionLoading = currentClip.automatedTranscription === "Transcribing...";
  const isTranslationLoading = currentClip.englishTranslation === "Translating..." || currentClip.translation === "Translating...";
  const isCorrectionsLoading = Array.isArray(currentClip.comparisonResult) &&
    currentClip.comparisonResult.length === 1 &&
    currentClip.comparisonResult[0].token === "Comparing...";

  const comprehensiveData = aiToolsState.getComprehensiveTranscriptionData();
  const canGetCorrections = comprehensiveData.hasValidUserTranscription &&
                           comprehensiveData.hasValidAutomatedTranscription &&
                           !isAutomatedTranscriptionError;
  const canTranslate = comprehensiveData.hasValidAutomatedTranscription &&
                      !isAutomatedTranscriptionError &&
                      !isAutomatedTranscriptionLoading;

  return (
    <Card>
      <CardHeader className="pb-3 md:pb-6">
        <CardTitle className="text-base md:text-lg">Transcription Support</CardTitle>
        <CardDescription className="text-sm">
          Compare the Automated Transcription with your version and translate to available languages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-6">
        <MediaControls
          effectiveClip={effectiveClip}
          currentPlaybackTime={currentPlaybackTime}
          isCurrentClipPlaying={isCurrentClipPlaying}
          isLooping={isLooping}
          setIsLooping={setIsLooping}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          mediaSrc={mediaSrc}
          clipDisplayName={clipDisplayName}
          disableTextarea={disableTextarea}
          videoPlayerRef={videoPlayerRef}
        />

        {/* Automated Transcription Section */}
        <div className="space-y-2">
          <h3 className="font-semibold mb-2 text-foreground text-sm md:text-base">Automated Transcription:</h3>
          <Button
            onClick={handleTranscribeClip}
            className="w-full mb-2 text-sm"
            disabled={isLoadingMedia || isSavingMedia || isAnyClipTranscribing}
          >
            <Sparkles className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />
            <span className="hidden md:inline">
              {isAnyClipTranscribing ? "Transcribing..." : focusedClip ? "Transcribe Focused Clip" : `Transcribe Clip ${currentClipIndex + 1}`}
            </span>
            <span className="md:hidden">{isAnyClipTranscribing ? "Transcribing..." : "Transcribe"}</span>
          </Button>
          <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50" resizable>
            {currentClip.automatedTranscription === "Transcribing..." && <ThreeDotsLoader className="mx-auto my-4" />}
            {currentClip.automatedTranscription && currentClip.automatedTranscription !== "Transcribing..." ? (
              <p className="text-sm">{currentClip.automatedTranscription}</p>
            ) : null}
            {!currentClip.automatedTranscription && (
              <p className="text-sm text-muted-foreground">Click "Transcribe" above to generate.</p>
            )}
          </ScrollArea>
        </div>

        {/* User Transcription Section */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-foreground text-sm md:text-base">Your Transcription:</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (isPracticeMode) {
                  setPracticeText("");
                } else {
                  setPracticeText(userTranscriptionInput);
                }
                setIsPracticeMode(!isPracticeMode);
              }}
              className="h-6 px-1 md:px-2 text-xs"
            >
              <Edit3 className="h-3 w-3 mr-1" />
              <span className="hidden md:inline">{isPracticeMode ? "Exit Practice" : "Practice"}</span>
              <span className="md:hidden">{isPracticeMode ? "Exit" : "Practice"}</span>
            </Button>
          </div>
          {isPracticeMode ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
                <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Practice mode: Changes won't be saved and will revert to your original transcription.
                </p>
              </div>
              <Textarea
                className="h-[70px] text-sm resize-y"
                placeholder="Practice typing here..."
                value={practiceText}
                onChange={(e) => setPracticeText(e.target.value)}
              />
            </div>
          ) : (
            <ScrollArea className="h-[70px] w-full rounded-md border p-3 bg-muted/30" resizable>
              {userTranscriptionInput ? (
                <p className="text-sm whitespace-pre-wrap">{userTranscriptionInput}</p>
              ) : (
                <p className="text-sm text-muted-foreground">You haven't typed anything for this clip yet.</p>
              )}
            </ScrollArea>
          )}
        </div>

        {/* Transcription Comparison Section */}
        <div className="space-y-2">
          <h3 className="font-semibold text-foreground text-sm md:text-base">Transcription Comparison:</h3>
          <Button
            onClick={handleGetCorrections}
            disabled={!canGetCorrections || isCorrectionsLoading || isAnyClipTranscribing}
            className="w-full text-sm"
          >
            <FileDiff className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />
            <span className="hidden md:inline">{isCorrectionsLoading ? "Comparing..." : "Get Corrections"}</span>
            <span className="md:hidden">{isCorrectionsLoading ? "Comparing..." : "Compare"}</span>
          </Button>
          <ScrollArea className="h-[120px] w-full rounded-md border p-3 bg-muted/50" resizable>
            {isCurrentClipComparing ? (
              <ThreeDotsLoader className="mx-auto my-4" />
            ) : currentClip.comparisonResult === null || currentClip.comparisonResult === undefined ? (
              <p className="text-sm text-muted-foreground">
                Click "Get Corrections" above after entering your transcription and generating the AI transcription.
              </p>
            ) : currentClip.comparisonResult.length === 1 && currentClip.comparisonResult[0].token === "Error generating comparison." ? (
              <p className="text-sm text-destructive">{currentClip.comparisonResult[0].token}</p>
            ) : (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {currentClip.comparisonResult.map(renderCorrectionToken)}
              </p>
            )}
          </ScrollArea>
        </div>

        {/* Translation Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground text-sm md:text-base">Translation:</h3>
            <TranslationLanguageSelector
              selectedLanguage={translationTargetLanguage}
              onLanguageChange={setTranslationTargetLanguage}
              disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
              label=""
              className="w-[100px] md:w-[140px]"
            />
          </div>
          <Button
            onClick={handleTranslate}
            disabled={!canTranslate || isTranslationLoading || isAnyClipTranscribing}
            className="w-full text-sm"
          >
            <Languages className="mr-1 md:mr-2 h-3 md:h-4 w-3 md:w-4" />
            <span className="hidden md:inline">
              {isTranslationLoading ? "Translating..." : `Translate to ${getLanguageLabel(translationTargetLanguage)}`}
            </span>
            <span className="md:hidden">{isTranslationLoading ? "Translating..." : "Translate"}</span>
          </Button>
          <ScrollArea className="h-[100px] w-full rounded-md border p-3 bg-muted/50" resizable>
            {isTranslationLoading ? (
              <ThreeDotsLoader className="mx-auto my-4" />
            ) : !getTranslationForCurrentTarget() ? (
              <p className="text-sm text-muted-foreground">
                Click "Translate to {getLanguageLabel(translationTargetLanguage)}" above after AI transcription is complete.
              </p>
            ) : getTranslationForCurrentTarget() === "" ? (
              <p className="text-sm">Translation complete. No specific output or translation was empty.</p>
            ) : getTranslationForCurrentTarget()?.startsWith("Error:") ? (
              <p className="text-sm text-destructive">{getTranslationForCurrentTarget()}</p>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{getTranslationForCurrentTarget()}</p>
            )}
          </ScrollArea>
        </div>
        <p className="text-xs text-muted-foreground italic mt-6 pt-2 border-t">
          Note: While AI tools may not be 100% accurate, they provide helpful guidance for learning.
        </p>
      </CardContent>
    </Card>
  );
}
