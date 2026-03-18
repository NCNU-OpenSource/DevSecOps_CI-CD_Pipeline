import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { SearchInput } from "./SearchInput";
import { SearchResultItem } from "./SearchResultItem";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast";
import { usePlayerStore } from "@/stores/playerStore";
import { getCurrentRequester, useLibraryStore } from "@/stores/libraryStore";
import { api } from "@/services/api";
import type { Track } from "@/types";
import { X } from "lucide-react";

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SearchModal = ({ open, onOpenChange }: SearchModalProps) => {
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

    // 設定全域載入狀態
    usePlayerStore
      .getState()
      .setLoadingTrack(true, `正在載入「${track.title}」...`);

    try {
      const response = await api.addToQueue(track, currentRequester);
      if (response.success) {
        showToast({ message: "已加入播放佇列", type: "success" });
        // 保持 Modal 開啟，不調用 onOpenChange(false)
      } else {
        showToast({ message: response.error || "加入失敗", type: "error" });
        // 加入失敗時清除載入狀態
        usePlayerStore.getState().setLoadingTrack(false);
      }
    } catch (error) {
      showToast({ message: "加入發生錯誤", type: "error" });
      // 發生錯誤時清除載入狀態
      usePlayerStore.getState().setLoadingTrack(false);
    } finally {
      setAddingId(null);
      // 注意：載入狀態會由 WebSocket 播放事件清除
    }
  };

  const handleCreateMix = async (track: Track) => {
    setCreatingMixId(track.videoId);
    usePlayerStore.getState().setLoadingTrack(true, "正在取得推薦歌曲...");

    try {
      const response = await api.createMix(track, currentRequester);
      if (response.success && response.data) {
        void saveMix(track, response.data.tracks);
        showToast({
          message: `已創建 Mix，加入 ${response.data.count} 首歌曲`,
          type: "success",
        });
        onOpenChange(false);
      } else {
        showToast({
          message: response.error || "創建 Mix 失敗",
          type: "error",
        });
        usePlayerStore.getState().setLoadingTrack(false);
      }
    } catch (error) {
      showToast({ message: "創建 Mix 發生錯誤", type: "error" });
      usePlayerStore.getState().setLoadingTrack(false);
    } finally {
      setCreatingMixId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,960px)] w-[min(98vw,1360px)] max-w-[1360px] flex-col p-0">
        <div className="border-b border-[color:var(--surface-border)] px-6 pb-5 pt-6 lg:px-8 lg:pb-6 lg:pt-7">
          <div className="mb-5 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <DialogTitle className="text-[2rem] font-semibold tracking-tight">
                搜尋音樂
              </DialogTitle>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                找到想播的歌，直接加入佇列或建立 Mix。
              </p>
            </div>
            <DialogClose
              className="static shrink-0 rounded-full p-4"
              aria-label="關閉搜尋"
            >
              <X className="h-6 w-6" />
            </DialogClose>
          </div>
          <SearchInput
            onSearch={handleSearch}
            isLoading={isSearching}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 lg:gap-5"
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 pt-4 lg:px-8 lg:pb-8">
            {isSearching ? (
              <div className="flex justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-3">
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
              <Empty
                title="尚無搜尋結果"
                description="輸入關鍵字開始搜尋音樂"
              />
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-[color:var(--surface-border)] p-4 text-center text-sm text-[var(--text-secondary)]">
          <kbd className="rounded-lg border border-[color:var(--surface-border)] bg-[var(--surface-subtle)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]">
            Esc
          </kbd>{" "}
          關閉
        </div>
      </DialogContent>
    </Dialog>
  );
};
