import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/toast";
import { usePlayerStore } from "@/stores/playerStore";
import { getCurrentRequester, useLibraryStore } from "@/stores/libraryStore";
import { api } from "@/services/api";
import { SearchResultItem } from "./SearchResultItem";
import type { CollectionSearchResult, Track } from "@/types";

const EMPTY_FAVORITES: Array<{ videoId: string }> = [];

export const MobileSearchPage = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [creatingMixId, setCreatingMixId] = useState<string | null>(null);
  const [addingCollectionId, setAddingCollectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const isMobileSearchOpen = usePlayerStore(
    (state) => state.isMobileSearchOpen,
  );
  const setMobileSearchOpen = usePlayerStore(
    (state) => state.setMobileSearchOpen,
  );
  const searchResults = usePlayerStore((state) => state.searchResults);
  const setSearchResults = usePlayerStore((state) => state.setSearchResults);
  const libraryReady = useLibraryStore((state) => state.ready);
  const favorites = useLibraryStore(
    (state) => state.snapshot?.favorites ?? EMPTY_FAVORITES,
  );
  const currentRequester = useLibraryStore((state) =>
    getCurrentRequester(state.snapshot),
  );
  const openPlaylistPicker = useLibraryStore((state) => state.openPlaylistPicker);
  const saveMix = useLibraryStore((state) => state.saveMix);
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const { showToast } = useToast();
  const favoriteTrackIds = new Set(
    favorites.map((favorite) => favorite.videoId),
  );

  useEffect(() => {
    if (isMobileSearchOpen) {
      setIsAnimating(true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setIsAnimating(false);
    }
  }, [isMobileSearchOpen]);

  const handleClose = () => {
    setMobileSearchOpen(false);
    setQuery("");
    setSearchResults([]);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const response = await api.search(query.trim());
      if (response.success && response.data) {
        setSearchResults(response.data);
        if (response.data.length === 0) {
          showToast({ message: "沒有找到相關內容", type: "info" });
        }
      } else {
        showToast({ message: response.error || "搜尋失敗", type: "error" });
      }
    } catch {
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
    } catch {
      showToast({ message: "加入發生錯誤", type: "error" });
    } finally {
      setAddingId(null);
    }
  };

  const handleAddCollection = async (result: CollectionSearchResult) => {
    setAddingCollectionId(result.id);

    try {
      const response = await api.addTracksToQueue(result.tracks, currentRequester);
      if (response.success && response.data) {
        showToast({
          message: `已加入 ${response.data.count} 首歌曲`,
          type: "success",
        });
      } else {
        showToast({
          message: response.error || "加入整組內容失敗",
          type: "error",
        });
      }
    } catch {
      showToast({ message: "加入整組內容發生錯誤", type: "error" });
    } finally {
      setAddingCollectionId(null);
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
    } catch {
      showToast({ message: "創建 Mix 發生錯誤", type: "error" });
    } finally {
      setCreatingMixId(null);
    }
  };

  const handleAddToPlaylist = (track: Track) => {
    if (!libraryReady) {
      showToast({ message: "媒體庫正在初始化", type: "info" });
      return;
    }

    openPlaylistPicker(track);
  };

  const handleToggleFavorite = async (track: Track) => {
    if (!libraryReady) {
      showToast({ message: "媒體庫正在初始化", type: "info" });
      return;
    }

    const wasFavorite = favoriteTrackIds.has(track.videoId);

    try {
      await toggleFavorite(track);
      showToast({
        message: wasFavorite ? "已移除收藏" : "已加入收藏",
        type: "success",
      });
    } catch {
      showToast({ message: "收藏更新失敗", type: "error" });
    }
  };

  if (!isMobileSearchOpen && !isAnimating) return null;

  const content = (
    <div
      className={`fixed inset-0 z-50 bg-white dark:bg-gray-950 ${
        isMobileSearchOpen ? "mobile-search-enter" : "mobile-search-exit"
      }`}
    >
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            onClick={handleClose}
            className="-ml-2 rounded-lg p-2 text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="返回"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            搜尋音樂
          </h1>
        </div>

        <form onSubmit={handleSearch} className="px-4 pb-4">
          <div className="relative">
            <Input
              ref={inputRef}
              type="text"
              placeholder="搜尋歌曲、藝人或貼上 YouTube 連結..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isSearching}
              className="h-12 w-full rounded-xl border-gray-200/64 bg-gray-100 pl-12 pr-4 text-base focus:ring-2 focus:ring-gray-900 dark:border-gray-700/64 dark:bg-gray-800 dark:focus:ring-gray-50"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg
                className="h-5 w-5"
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
                className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-gradient-to-r from-gray-900 to-gray-700 px-4 text-sm text-white transition-transform duration-200 hover:translate-y-0.5 dark:from-gray-50 dark:to-gray-200 dark:text-gray-900"
              >
                {isSearching ? <Spinner size="sm" /> : "搜尋"}
              </Button>
            )}
          </div>
        </form>
      </div>

      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="px-4 py-4">
          {isSearching ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map((result) => (
                <SearchResultItem
                  key={`${result.kind}:${result.id}`}
                  result={result}
                  onAdd={handleAddToQueue}
                  onCreateMix={handleCreateMix}
                  onAddToPlaylist={handleAddToPlaylist}
                  onToggleFavorite={handleToggleFavorite}
                  onAddCollection={handleAddCollection}
                  favoriteTrackIds={favoriteTrackIds}
                  favoriteDisabled={!libraryReady}
                  isAdding={result.kind === "track" && addingId === result.id}
                  isCreatingMix={
                    result.kind === "track" && creatingMixId === result.id
                  }
                  isCollectionPending={
                    result.kind !== "track" && addingCollectionId === result.id
                  }
                  pendingTrackId={addingId}
                />
              ))}
            </div>
          ) : (
            <Empty
              title="尚無搜尋結果"
              description="輸入關鍵字或貼上 YouTube 連結開始搜尋"
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return createPortal(content, document.body);
};
