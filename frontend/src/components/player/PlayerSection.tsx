import { Card } from "@/components/ui/card";
import { NowPlaying } from "./NowPlaying";
import { ProgressBar } from "./ProgressBar";
import { PlaybackControls } from "./PlaybackControls";
import { VolumeControl } from "./VolumeControl";
import { usePlayerStore } from "@/stores/playerStore";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { formatTime } from "@/utils/format";
import { RadioToggleButton } from "./RadioToggleButton";

interface PlayerSectionProps {
  isIdle?: boolean;
  onSearchClick?: () => void;
  sidebarMode?: boolean;
}

export const PlayerSection = ({
  isIdle = false,
  onSearchClick,
  sidebarMode = false,
}: PlayerSectionProps) => {
  const currentTrack = usePlayerStore((state) => state.playbackState.currentTrack);
  const queue = usePlayerStore((state) => state.playbackState.queue);
  const nextTrack = queue[0];
  const shouldShowIdleLayout = isIdle || (!currentTrack && queue.length === 0);
  const isSidebarPlayer = sidebarMode && !shouldShowIdleLayout;

  return (
    <Card
      className={cn(
        "desktop-player-shell surface-card-strong min-h-0 overflow-hidden p-0",
        shouldShowIdleLayout
          ? "mx-auto w-full max-w-[920px]"
          : isSidebarPlayer
            ? "h-full w-full"
            : "h-full",
      )}
    >
      <div
        className={cn(
          "relative z-10 flex h-full min-h-0 flex-col overflow-y-auto",
          !shouldShowIdleLayout && "desktop-scrollbar",
          shouldShowIdleLayout
            ? "min-h-[620px] px-8 py-12 lg:px-12 lg:py-14"
            : isSidebarPlayer
              ? "p-5 xl:p-6"
              : "p-5 lg:p-6 xl:p-8",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full min-h-0 flex-col",
            shouldShowIdleLayout
              ? "max-w-[760px] justify-center gap-10"
              : isSidebarPlayer
                ? "max-w-none gap-4 xl:gap-5"
                : "max-w-[760px] gap-4 lg:gap-5 xl:gap-6",
          )}
        >
          {/* 當前播放資訊 */}
          <NowPlaying
            onSearchClick={onSearchClick}
            showIdleState={shouldShowIdleLayout}
            compact={!shouldShowIdleLayout}
            sidebarMode={isSidebarPlayer}
          />

          {!shouldShowIdleLayout ? (
            <div
              className={cn(
                "flex flex-col",
                isSidebarPlayer ? "gap-4 pb-5 xl:pb-6" : "gap-5 pb-6 xl:gap-6 xl:pb-8",
              )}
            >
              {/* 播放進度條 */}
              <ProgressBar />

              {/* 播放控制與音量 */}
              <div
                className={cn(
                  "flex flex-col border-t border-[color:var(--surface-border)]",
                  isSidebarPlayer ? "gap-4 pt-4" : "gap-4 pt-5 xl:gap-5 xl:pt-6",
                )}
              >
                <div
                  className={cn(
                    "surface-subtle rounded-[28px] border border-[color:var(--dynamic-ring)]",
                    isSidebarPlayer ? "p-4" : "p-4 xl:p-5",
                  )}
                >
                  <div className="space-y-4">
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        播放控制
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-3 xl:gap-4">
                        <PlaybackControls showRadioToggle={false} />
                        <RadioToggleButton compact className="h-[52px] px-5" />
                      </div>
                    </div>

                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                        音量
                      </p>
                      <VolumeControl
                        className={cn(
                          "h-[56px] max-w-none",
                          isSidebarPlayer ? "min-w-0 w-full" : "xl:min-w-[300px]",
                        )}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "surface-subtle rounded-[24px] border border-[color:var(--dynamic-ring)]",
                    "p-4",
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    即將播放
                  </p>
                  {nextTrack ? (
                    <div className="mt-3 flex min-w-0 items-center gap-3 xl:gap-4">
                      <Avatar
                        src={nextTrack.thumbnail}
                        alt={nextTrack.title}
                        size="md"
                        thumbnailQuality="sddefault"
                        className="rounded-2xl"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-base font-semibold text-[var(--text-primary)]"
                          title={nextTrack.title}
                        >
                          {nextTrack.title}
                        </p>
                        <p
                          className="truncate text-sm text-[var(--text-secondary)]"
                          title={nextTrack.artist}
                        >
                          {nextTrack.artist}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[color:var(--dynamic-ring)] bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
                        {formatTime(nextTrack.duration)}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--text-secondary)]">
                      目前沒有下一首歌曲。建立 Mix 或加入佇列，音樂就能繼續播放。
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
};
