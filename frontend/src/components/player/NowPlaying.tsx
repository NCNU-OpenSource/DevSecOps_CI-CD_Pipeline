import { AnimatedAvatar } from "@/components/ui/animated-avatar";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePlayerStore } from "@/stores/playerStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { cn } from "@/lib/utils";
import { Heart, Library, Search, Sparkles } from "lucide-react";

const EMPTY_FAVORITES: Array<{ videoId: string }> = [];

interface NowPlayingProps {
  onSearchClick?: () => void;
  showIdleState?: boolean;
  compact?: boolean;
  sidebarMode?: boolean;
}

export const NowPlaying = ({
  onSearchClick,
  showIdleState = true,
  compact = false,
  sidebarMode = false,
}: NowPlayingProps) => {
  const currentTrack = usePlayerStore((state) => state.playbackState.currentTrack);
  const isPlaying = usePlayerStore((state) => state.playbackState.isPlaying);
  const libraryReady = useLibraryStore((state) => state.ready);
  const favorites = useLibraryStore(
    (state) => state.snapshot?.favorites ?? EMPTY_FAVORITES,
  );
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const openPlaylistPicker = useLibraryStore((state) => state.openPlaylistPicker);
  const { showToast } = useToast();

  if (!currentTrack) {
    if (!showIdleState) {
      return (
        <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <Avatar
            size="lg"
            className="h-44 w-44 rounded-[28px] border border-[color:var(--dynamic-ring)] bg-[color:color-mix(in_srgb,var(--surface-elevated)_84%,var(--accent-soft)_16%)]"
            fallback={<Sparkles className="h-14 w-14 text-[var(--text-muted)]" />}
          />
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-[color:var(--dynamic-ring)] bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Preparing
            </span>
            <div>
              <p className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
                正在準備播放
              </p>
              <p className="mt-2 text-base text-[var(--text-secondary)]">
                播放器正在接手你的歌曲，封面與歌詞會在開始後出現在這裡。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center justify-center gap-7 text-center lg:gap-8">
        <div className="relative">
          <div className="absolute inset-4 rounded-[28px] bg-[var(--accent-soft)] blur-3xl opacity-80" />
          <Avatar
            size="lg"
            className="relative h-40 w-40 rounded-[28px] border border-[color:var(--dynamic-ring)] bg-[color:color-mix(in_srgb,var(--surface-elevated)_84%,var(--accent-soft)_16%)] shadow-[0_22px_48px_-28px_rgba(15,23,42,0.28)] lg:h-48 lg:w-48"
            fallback={
              <Sparkles className="h-14 w-14 text-[var(--text-muted)] lg:h-16 lg:w-16" />
            }
          />
        </div>
        <div className="flex max-w-[640px] flex-col items-center gap-4">
          <span className="inline-flex rounded-full border border-[color:var(--dynamic-ring)] bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Ready to play
          </span>
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] lg:text-[3.4rem]">
              開始播放你的第一首歌
            </p>
            <p className="mx-auto max-w-[34rem] text-base leading-8 text-[var(--text-secondary)] lg:text-lg">
              搜尋並加入歌曲後，動態背景、封面轉場、歌詞與播放佇列都會跟著音樂一起展開。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            size="lg"
            onClick={onSearchClick}
            className="h-12 rounded-2xl px-5 shadow-[0_20px_34px_-18px_var(--accent-glow)]"
          >
            <Search className="h-4 w-4" />
            搜尋音樂
          </Button>
          <div className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface-subtle)] px-4 text-sm font-medium text-[var(--text-secondary)]">
            <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-xl border border-[color:var(--surface-border)] bg-[var(--surface-muted)] px-2 font-mono text-xs">
              <span className="text-[0.65rem]">⌘</span>K
            </kbd>
            快速搜尋
          </div>
        </div>
        <p className="max-w-[32rem] text-sm leading-7 text-[var(--text-muted)]">
          加入第一首後，你就可以建立 Mix、查看即時歌詞，或把更多歌曲排進播放佇列。
        </p>
      </div>
    );
  }

  const isFavorite = favorites.some(
    (favorite) => favorite.videoId === currentTrack.videoId,
  );
  const isSidebarCompact = compact && sidebarMode;

  return (
    <div
      className={cn(
        "min-w-0",
        isSidebarCompact
          ? "grid items-center gap-4 grid-cols-[116px_minmax(0,1fr)] xl:gap-5 xl:grid-cols-[132px_minmax(0,1fr)]"
          : compact
          ? "grid items-center gap-5 lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-8"
          : "flex flex-col gap-6 lg:gap-7"
      )}
    >
      <div className="flex justify-center lg:justify-start">
        <AnimatedAvatar
          src={currentTrack.thumbnail}
          alt={currentTrack.title}
          size="lg"
          thumbnailQuality="maxresdefault"
          className={
            isSidebarCompact
              ? "h-28 w-28 rounded-[22px] border border-[color:var(--dynamic-ring)] shadow-[0_20px_40px_-24px_rgba(15,23,42,0.75)] xl:h-32 xl:w-32 xl:rounded-[24px]"
              : compact
              ? "h-40 w-40 rounded-[28px] border border-[color:var(--dynamic-ring)] shadow-[0_26px_54px_-28px_rgba(15,23,42,0.85)] lg:h-48 lg:w-48 xl:h-56 xl:w-56 xl:rounded-[30px]"
              : "h-52 w-52 rounded-[32px] border border-[color:var(--dynamic-ring)] shadow-[0_26px_54px_-28px_rgba(15,23,42,0.85)] lg:h-64 lg:w-64"
          }
        />
      </div>
      <div
        className={cn(
          "min-w-0 space-y-4 text-center lg:text-left",
          isSidebarCompact && "space-y-3 text-left",
        )}
      >
        <span className="inline-flex rounded-full border border-[color:var(--dynamic-ring)] bg-[color:var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)]">
          {isPlaying ? "Now Playing" : "Paused"}
        </span>
        <div className="min-w-0 space-y-2">
          <h2
            className={cn(
              "text-[var(--text-primary)]",
              isSidebarCompact
                ? "line-clamp-2 text-[1.9rem] font-semibold tracking-tight xl:text-[2.2rem]"
                : compact
                ? "line-clamp-2 text-[2.2rem] font-semibold tracking-tight lg:text-[2.35rem] xl:text-[2.8rem]"
                : "line-clamp-2 text-3xl font-semibold tracking-tight lg:text-[2.4rem] xl:text-[2.6rem]",
            )}
            title={currentTrack.title}
          >
            {currentTrack.title}
          </h2>
          <p
            className={cn(
              "truncate text-[var(--text-secondary)]",
              isSidebarCompact
                ? "text-base xl:text-lg"
                : compact
                  ? "text-lg lg:text-xl"
                  : "text-lg lg:text-lg xl:text-xl",
            )}
            title={currentTrack.artist}
          >
            {currentTrack.artist}
          </p>
        </div>
        <div
          className={cn(
            "flex flex-wrap justify-center gap-3 lg:justify-start",
            isSidebarCompact && "gap-2 justify-start",
          )}
        >
          <Button
            variant="outline"
            className={cn("rounded-2xl", isSidebarCompact && "h-10 px-3")}
            disabled={!libraryReady}
            onClick={async () => {
              if (!libraryReady) {
                showToast({ message: "媒體庫正在初始化", type: "info" });
                return;
              }

              try {
                await toggleFavorite(currentTrack);
                showToast({
                  message: isFavorite ? "已移除收藏" : "已加入收藏",
                  type: "success",
                });
              } catch {
                showToast({ message: "收藏更新失敗", type: "error" });
              }
            }}
          >
            <Heart
              className="h-4 w-4"
              fill={isFavorite ? "currentColor" : "none"}
            />
            收藏
          </Button>
          <Button
            variant="outline"
            className={cn("rounded-2xl", isSidebarCompact && "h-10 px-3")}
            disabled={!libraryReady}
            onClick={() => {
              if (!libraryReady) {
                showToast({ message: "媒體庫正在初始化", type: "info" });
                return;
              }

              openPlaylistPicker(currentTrack);
            }}
          >
            <Library className="h-4 w-4" />
            加入歌單
          </Button>
        </div>
      </div>
    </div>
  );
};
