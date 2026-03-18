import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast";
import { usePlayerStore } from "@/stores/playerStore";
import { getCurrentRequester, useLibraryStore } from "@/stores/libraryStore";
import { api } from "@/services/api";
import { formatTime } from "@/utils/format";
import type { Track } from "@/types";
import { Library } from "lucide-react";

export const MobileContent = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [creatingMixId, setCreatingMixId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const searchResults = usePlayerStore((state) => state.searchResults);
  const setSearchResults = usePlayerStore((state) => state.setSearchResults);
  const openPlaylistPicker = useLibraryStore((state) => state.openPlaylistPicker);
  const saveMix = useLibraryStore((state) => state.saveMix);
  const currentRequester = useLibraryStore((state) =>
    getCurrentRequester(state.snapshot),
  );
  const { showToast } = useToast();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const response = await api.search(query.trim());
      if (response.success && response.data) {
        setSearchResults(response.data);
        if (response.data.length === 0) {
          showToast({ message: "沒有找到相關歌曲", type: "info" });
        }
      } else {
        showToast({ message: response.error || "搜尋失敗", type: "error" });
      }
    } catch (error) {
      showToast({ message: "搜尋發生錯誤", type: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddToQueue = async (track: Track) => {
    setAddingId(track.videoId);
    try {
      const response = await api.addToQueue(track, currentRequester);
      if (response.success) {
        showToast({ message: "已加入播放佇列", type: "success" });
      } else {
        showToast({ message: response.error || "加入失敗", type: "error" });
      }
    } catch (error) {
      showToast({ message: "加入發生錯誤", type: "error" });
    } finally {
      setAddingId(null);
    }
  };

  const handleCreateMix = async (track: Track) => {
    setCreatingMixId(track.videoId);
    try {
      const response = await api.createMix(track, currentRequester);
      if (response.success && response.data) {
        void saveMix(track, response.data.tracks);
        showToast({
          message: `已建立 Mix，加入 ${response.data.count} 首歌曲`,
          type: "success",
        });
      } else {
        showToast({ message: response.error || "建立 Mix 失敗", type: "error" });
      }
    } catch (error) {
      showToast({ message: "建立 Mix 發生錯誤", type: "error" });
    } finally {
      setCreatingMixId(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col pb-[168px] lg:hidden">
      <form onSubmit={handleSearch} className="shrink-0 px-4 py-4">
        <div className="surface-card relative rounded-[28px] border p-3">
          <Input
            ref={inputRef}
            type="text"
            placeholder="搜尋歌曲或藝人..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
            className="h-14 rounded-[20px] border-0 bg-[var(--surface-subtle)] pl-12 pr-24 text-base"
          />
          <div className="absolute left-7 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          {query.trim() && (
            <Button
              type="submit"
              disabled={isSearching}
              className="absolute right-5 top-1/2 h-9 -translate-y-1/2 rounded-[14px] px-4 text-sm shadow-[0_18px_30px_-20px_var(--accent-glow)]"
            >
              {isSearching ? <Spinner size="sm" /> : "搜尋"}
            </Button>
          )}
        </div>
      </form>

      <ScrollArea className="flex-1 px-4 min-h-0" maxHeight="none">
        {isSearching ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : searchResults.length > 0 ? (
          <div className="space-y-3 pb-4">
            {searchResults.map((result) => (
              <MobileSearchResultCard
                key={result.videoId}
                result={result}
                onAdd={handleAddToQueue}
                onCreateMix={handleCreateMix}
                onAddToPlaylist={openPlaylistPicker}
                isAdding={addingId === result.videoId}
                isCreatingMix={creatingMixId === result.videoId}
              />
            ))}
          </div>
        ) : (
          <Empty title="尚無搜尋結果" description="輸入關鍵字開始搜尋音樂" />
        )}
      </ScrollArea>
    </div>
  );
};

// COSSUI 風格的搜尋結果卡片
interface MobileSearchResultCardProps {
  result: Track;
  onAdd: (track: Track) => void;
  onCreateMix: (track: Track) => void;
  onAddToPlaylist: (track: Track) => void;
  isAdding?: boolean;
  isCreatingMix?: boolean;
}

const MobileSearchResultCard = ({
  result,
  onAdd,
  onCreateMix,
  onAddToPlaylist,
  isAdding,
  isCreatingMix,
}: MobileSearchResultCardProps) => {
  return (
    <Card className="surface-card rounded-[26px] p-4">
      <div className="flex items-center gap-3">
        <Avatar
          src={result.thumbnail}
          alt={result.title}
          size="lg"
          className="rounded-[18px] border border-[color:var(--surface-border)]"
        />
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {result.title}
          </h3>
          <p className="truncate text-xs text-[var(--text-secondary)]">
            {result.artist}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {formatTime(result.duration)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 rounded-[14px] px-0"
            onClick={() => onAddToPlaylist(result)}
            disabled={isAdding || isCreatingMix}
          >
            <Library className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-[14px] px-3"
            onClick={() => onCreateMix(result)}
            disabled={isAdding || isCreatingMix}
          >
            {isCreatingMix ? "建立中" : "Mix"}
          </Button>
          <Button
            onClick={() => onAdd(result)}
            disabled={isAdding || isCreatingMix}
            size="sm"
            className="h-9 shrink-0 rounded-[14px] px-4 text-sm shadow-[0_18px_30px_-20px_var(--accent-glow)]"
          >
            {isAdding ? "加入中..." : "加入"}
          </Button>
        </div>
      </div>
    </Card>
  );
};
