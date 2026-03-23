import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/stores/playerStore";
import { api } from "@/services/api";
import { Spinner } from "@/components/ui/spinner";
import { Pause, Play, SkipForward } from "lucide-react";
import { RadioToggleButton } from "./RadioToggleButton";

interface PlaybackControlsProps {
  showRadioToggle?: boolean;
}

export const PlaybackControls = ({
  showRadioToggle = true,
}: PlaybackControlsProps) => {
  // 分別選擇以避免創建新對象
  const isPlaying = usePlayerStore((state) => state.playbackState.isPlaying);
  const currentTrack = usePlayerStore(
    (state) => state.playbackState.currentTrack,
  );
  const nextTrack = usePlayerStore((state) => state.playbackState.queue[0] ?? null);
  const radioEnabled = usePlayerStore((state) => state.playbackState.radioEnabled);
  const isLoadingTrack = usePlayerStore((state) => state.isLoadingTrack);
  const setLoadingTrack = usePlayerStore((state) => state.setLoadingTrack);

  const handlePlayPause = async () => {
    // 載入中時不允許操作
    if (isLoadingTrack) return;

    if (isPlaying) {
      await api.pause();
    } else {
      await api.play();
    }
  };

  const handleSkip = async () => {
    if (!currentTrack || isLoadingTrack) {
      return;
    }

    const shouldShowLoading = radioEnabled || nextTrack !== null;
    if (shouldShowLoading) {
      setLoadingTrack(
        true,
        nextTrack
          ? `正在載入「${nextTrack.title}」...`
          : "正在準備下一首...",
      );
    }

    try {
      await api.skip();
    } catch (error) {
      if (shouldShowLoading) {
        setLoadingTrack(false);
      }
      console.error("跳過失敗:", error);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 xl:flex-nowrap">
      {showRadioToggle ? (
        <RadioToggleButton className="shrink-0" />
      ) : null}
      <div className="flex shrink-0 items-center gap-3">
        <Button
          variant="default"
          size="lg"
          onClick={handlePlayPause}
          disabled={!currentTrack || isLoadingTrack}
          title={isPlaying ? "暫停" : "播放"}
          className="h-16 w-16 shrink-0 rounded-full px-0 text-lg shadow-[0_20px_34px_-18px_var(--accent-glow)]"
        >
          {isLoadingTrack ? (
            <Spinner size="sm" />
          ) : isPlaying ? (
            <Pause className="h-7 w-7 fill-current" />
          ) : (
            <Play className="h-7 w-7 fill-current" />
          )}
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={handleSkip}
          disabled={!currentTrack || isLoadingTrack}
          title="跳過"
          className="h-[52px] w-[52px] shrink-0 rounded-full px-0"
        >
          <SkipForward className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};
