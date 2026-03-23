import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { OpenAlbumButton } from "@/components/album/OpenAlbumButton";
import { cn } from "@/lib/utils";
import { formatTime } from "@/utils/format";
import type { CollectionSearchResult, SearchResult, Track } from "@/types";
import {
  ChevronDown,
  ChevronUp,
  Disc3,
  Heart,
  Library,
  Loader2,
  ListMusic,
  Plus,
  Radio,
  Shuffle,
} from "lucide-react";
import { ThumbnailQuality } from "@/utils/thumbnail";

interface SearchResultItemProps {
  result: SearchResult;
  onAdd: (track: Track) => void;
  onCreateMix: (track: Track) => void;
  onAddToPlaylist: (track: Track) => void;
  onToggleFavorite: (track: Track) => void | Promise<void>;
  onAddCollection: (result: CollectionSearchResult) => void;
  favoriteTrackIds: ReadonlySet<string>;
  favoriteDisabled?: boolean;
  isAdding?: boolean;
  isCreatingMix?: boolean;
  isCollectionPending?: boolean;
  pendingTrackId?: string | null;
}

function getCollectionBadgeLabel(kind: CollectionSearchResult["kind"]): string {
  switch (kind) {
    case "album":
      return "Album";
    case "playlist":
      return "Playlist";
    case "mix":
      return "Mix";
  }
}

function getCollectionActionLabel(result: CollectionSearchResult): string {
  switch (result.kind) {
    case "album":
      return "整張專輯加入佇列";
    case "playlist":
      return "整個播放清單加入佇列";
    case "mix":
      return "整組 Mix 加入佇列";
  }
}

function getCollectionIcon(kind: CollectionSearchResult["kind"]) {
  switch (kind) {
    case "album":
      return Disc3;
    case "playlist":
      return ListMusic;
    case "mix":
      return Radio;
  }
}

export const SearchResultItem = ({
  result,
  onAdd,
  onCreateMix,
  onAddToPlaylist,
  onToggleFavorite,
  onAddCollection,
  favoriteTrackIds,
  favoriteDisabled = false,
  isAdding,
  isCreatingMix,
  isCollectionPending,
  pendingTrackId,
}: SearchResultItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (result.kind === "track") {
    const track = result.track;

    return (
      <Card className="rounded-[28px] p-4 lg:rounded-[32px] lg:p-6">
        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[120px_minmax(0,1fr)_260px] xl:items-center">
          <div className="flex items-start gap-4 xl:block">
            <Avatar
              src={result.thumbnail}
              alt={result.title}
              size="lg"
              className="h-[96px] w-[96px] shrink-0 rounded-[24px] border border-[color:var(--surface-border)] lg:h-[120px] lg:w-[120px] lg:rounded-[26px]"
              thumbnailQuality={ThumbnailQuality.HIGH}
            />
            <div className="min-w-0 flex-1 xl:hidden">
              <TrackSummary result={result} track={track} />
            </div>
          </div>
          <div className="hidden min-w-0 space-y-2 xl:block xl:pr-4">
            <TrackSummary result={result} track={track} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 xl:flex-col xl:items-stretch xl:justify-self-end">
            <Button
              onClick={() => onAddToPlaylist(track)}
              disabled={isAdding || isCreatingMix}
              variant="outline"
              title="加入自定歌單"
              className="h-11 rounded-[18px] px-4 xl:w-full xl:justify-start"
            >
              <Library className="h-4 w-4" />
              <span>加入歌單</span>
            </Button>
            <Button
              onClick={() => onAdd(track)}
              disabled={isAdding || isCreatingMix}
              className="h-11 min-w-[180px] rounded-[18px] px-5 text-base xl:w-full"
            >
              {isAdding ? (
                "加入中..."
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" />
                  加入佇列
                </>
              )}
            </Button>
            <Button
              onClick={() => onCreateMix(track)}
              disabled={isAdding || isCreatingMix}
              variant="outline"
              title="創建 Mix 混合播放清單"
              className="h-11 rounded-[18px] px-4 xl:w-full xl:justify-start"
            >
              {isCreatingMix ? (
                "建立中..."
              ) : (
                <>
                  <Shuffle className="h-4 w-4" />
                  <span>建立 Mix</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  const CollectionIcon = getCollectionIcon(result.kind);
  const loadedTrackCount = result.tracks.length;

  return (
    <Card className="rounded-[28px] p-4 lg:rounded-[32px] lg:p-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[120px_minmax(0,1fr)_280px] xl:items-center">
          <div className="flex items-start gap-4 xl:block">
            <Avatar
              src={result.thumbnail || result.tracks[0]?.thumbnail}
              alt={result.title}
              size="lg"
              className="h-[96px] w-[96px] shrink-0 rounded-[24px] border border-[color:var(--surface-border)] lg:h-[120px] lg:w-[120px] lg:rounded-[26px]"
              thumbnailQuality={ThumbnailQuality.HIGH}
            />
            <div className="min-w-0 flex-1 xl:hidden">
              <CollectionSummary result={result} />
            </div>
          </div>
          <div className="hidden min-w-0 xl:block xl:pr-4">
            <CollectionSummary result={result} />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 xl:flex-col xl:items-stretch xl:justify-self-end">
            <Button
              onClick={() => onAddCollection(result)}
              disabled={isCollectionPending}
              className="h-11 min-w-[220px] rounded-[18px] px-5 text-base xl:w-full"
            >
              {isCollectionPending ? (
                "加入中..."
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" />
                  {getCollectionActionLabel(result)}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExpanded((current) => !current)}
              className="h-11 rounded-[18px] px-4 xl:w-full xl:justify-start"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  收合曲目
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  展開曲目
                </>
              )}
            </Button>
          </div>
        </div>

        {isExpanded ? (
          <div className="rounded-[22px] border border-[color:var(--surface-border)] bg-[var(--surface-subtle)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <CollectionIcon className="h-4 w-4" />
                <span>
                  已載入 {loadedTrackCount} / {result.trackCount} 首
                </span>
              </div>
              {result.truncated ? (
                <span className="text-xs text-[var(--text-muted)]">
                  僅顯示前 {loadedTrackCount} 首
                </span>
              ) : null}
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {result.tracks.map((track, index) => (
                <CollectionTrackRow
                  key={`${track.videoId}-${index}`}
                  track={track}
                  index={index}
                  onAdd={onAdd}
                  onAddToPlaylist={onAddToPlaylist}
                  onToggleFavorite={onToggleFavorite}
                  isFavorite={favoriteTrackIds.has(track.videoId)}
                  isFavoriteDisabled={favoriteDisabled}
                  isAdding={pendingTrackId === track.videoId}
                  isCollectionPending={Boolean(isCollectionPending)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
};

const TrackSummary = ({
  result,
  track,
}: {
  result: Extract<SearchResult, { kind: "track" }>;
  track: Track;
}) => (
  <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
      <span className="rounded-full border border-[color:var(--surface-border)] bg-[var(--surface-subtle)] px-3 py-1">
        Song
      </span>
      <span>{formatTime(result.duration)}</span>
    </div>
    <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-[var(--text-primary)] lg:text-[1.95rem]">
      {result.title}
    </h3>
    <p className="line-clamp-2 text-sm text-[var(--text-secondary)] lg:text-lg">
      {result.artist}
    </p>
    <OpenAlbumButton
      album={track.album}
      trackTitle={track.title}
      className="text-sm"
    />
    <p className="text-sm text-[var(--text-muted)]">
      可直接加入佇列、查看專輯、收藏到歌單或建立推薦流
    </p>
  </div>
);

const CollectionSummary = ({
  result,
}: {
  result: CollectionSearchResult;
}) => {
  const CollectionIcon = getCollectionIcon(result.kind);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
        <span className="rounded-full border border-[color:var(--surface-border)] bg-[var(--surface-subtle)] px-3 py-1">
          {getCollectionBadgeLabel(result.kind)}
        </span>
        <span>{result.trackCount} 首歌曲</span>
      </div>
      <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-[var(--text-primary)] lg:text-[1.95rem]">
        {result.title}
      </h3>
      <p className="line-clamp-2 text-sm text-[var(--text-secondary)] lg:text-lg">
        {result.artist}
      </p>
      {result.subtitle ? (
        <p className="text-sm text-[var(--text-secondary)]">{result.subtitle}</p>
      ) : null}
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <CollectionIcon className="h-4 w-4" />
        <span>
          可展開查看曲目，並對單首歌曲加入佇列、歌單或收藏
        </span>
      </div>
      {result.truncated ? (
        <p className="text-xs text-[var(--text-muted)]">
          此結果目前只載入前 {result.tracks.length} 首歌曲。
        </p>
      ) : null}
    </div>
  );
};

const CollectionTrackRow = ({
  track,
  index,
  onAdd,
  onAddToPlaylist,
  onToggleFavorite,
  isFavorite,
  isFavoriteDisabled,
  isAdding,
  isCollectionPending,
}: {
  track: Track;
  index: number;
  onAdd: (track: Track) => void;
  onAddToPlaylist: (track: Track) => void;
  onToggleFavorite: (track: Track) => void | Promise<void>;
  isFavorite: boolean;
  isFavoriteDisabled: boolean;
  isAdding: boolean;
  isCollectionPending: boolean;
}) => (
  <div className="grid gap-3 rounded-[18px] border border-[color:var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-7 shrink-0 text-right text-xs text-[var(--text-muted)]">
        {index + 1}
      </span>
      <Avatar
        src={track.thumbnail}
        alt={track.title}
        size="sm"
        className="rounded-[14px] border border-[color:var(--surface-border)]"
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-[var(--text-primary)]"
          title={track.title}
        >
          {track.title}
        </p>
        <p
          className="truncate text-xs text-[var(--text-secondary)]"
          title={track.artist}
        >
          {track.artist}
        </p>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
      <span className="shrink-0 text-xs text-[var(--text-muted)]">
        {formatTime(track.duration)}
      </span>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onToggleFavorite(track)}
          disabled={isFavoriteDisabled}
          title={isFavorite ? "取消收藏" : "加入收藏"}
          className={cn(
            "h-8 rounded-xl px-2.5 text-xs",
            isFavorite &&
              "border-[var(--accent)] text-[var(--accent)] hover:text-[var(--accent)]",
          )}
        >
          <Heart
            className="h-3.5 w-3.5"
            fill={isFavorite ? "currentColor" : "none"}
          />
          <span className="hidden lg:inline">收藏</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAddToPlaylist(track)}
          title="加入歌單"
          className="h-8 rounded-xl px-2.5 text-xs"
        >
          <Library className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">歌單</span>
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onAdd(track)}
          disabled={isAdding || isCollectionPending}
          title="加入佇列"
          className="h-8 rounded-xl px-2.5 text-xs"
        >
          {isAdding ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="hidden lg:inline">加入中</span>
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">加入</span>
            </>
          )}
        </Button>
      </div>
    </div>
  </div>
);
