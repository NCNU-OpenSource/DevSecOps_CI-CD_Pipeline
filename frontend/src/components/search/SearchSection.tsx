import { useState } from "react";
import { SearchInput } from "./SearchInput";
import { SearchResultItem } from "./SearchResultItem";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { usePlayerStore } from "@/stores/playerStore";
import { getCurrentRequester, useLibraryStore } from "@/stores/libraryStore";
import { api } from "@/services/api";
import type { Track } from "@/types";

export const SearchSection = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [creatingMixId, setCreatingMixId] = useState<string | null>(null);

  const searchResults = usePlayerStore((state) => state.searchResults);
  const setSearchResults = usePlayerStore((state) => state.setSearchResults);
  const openPlaylistPicker = useLibraryStore((state) => state.openPlaylistPicker);
  const saveMix = useLibraryStore((state) => state.saveMix);
  const currentRequester = useLibraryStore((state) =>
    getCurrentRequester(state.snapshot),
  );
  const { showToast } = useToast();

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const response = await api.search(query);
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
          message: `已創建 Mix，加入 ${response.data.count} 首歌曲`,
          type: "success",
        });
      } else {
        showToast({
          message: response.error || "創建 Mix 失敗",
          type: "error",
        });
      }
    } catch (error) {
      showToast({ message: "創建 Mix 發生錯誤", type: "error" });
    } finally {
      setCreatingMixId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
          搜尋音樂
        </h2>
      </div>

      <SearchInput onSearch={handleSearch} isLoading={isSearching} />

      {isSearching ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          {searchResults.map((result) => (
            <SearchResultItem
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
    </div>
  );
};
