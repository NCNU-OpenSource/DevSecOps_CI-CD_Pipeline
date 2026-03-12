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
import { api } from "@/services/api";
import { formatTime } from "@/utils/format";
import type { Track } from "@/types";

export const MobileContent = () => {
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const searchResults = usePlayerStore((state) => state.searchResults);
  const setSearchResults = usePlayerStore((state) => state.setSearchResults);
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

  const handleAddToQueue = async (videoId: string) => {
    setAddingId(videoId);
    try {
      const response = await api.addToQueue(videoId);
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

  return (
    <div className="lg:hidden flex flex-col h-full pb-[168px]">
      {/* COSSUI 風格搜尋輸入框 */}
      <form onSubmit={handleSearch} className="px-4 py-4 flex-shrink-0">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            placeholder="搜尋歌曲或藝人..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
            className="w-full h-12 pl-12 pr-4 text-base bg-gray-100 dark:bg-gray-800 border-gray-200/64 dark:border-gray-700/64 rounded-xl focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-50"
          />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
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
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-4 text-sm bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-50 dark:to-gray-200 text-white dark:text-gray-900 rounded-lg hover:translate-y-0.5 transition-transform duration-200"
            >
              {isSearching ? <Spinner size="sm" /> : "搜尋"}
            </Button>
          )}
        </div>
      </form>

      {/* 搜尋結果 */}
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
                isAdding={addingId === result.videoId}
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
  onAdd: (videoId: string) => void;
  isAdding?: boolean;
}

const MobileSearchResultCard = ({
  result,
  onAdd,
  isAdding,
}: MobileSearchResultCardProps) => {
  return (
    <Card className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 shadow-md/5 hover:shadow-lg/10 transition-shadow duration-200">
      <div className="flex items-center gap-3">
        <Avatar src={result.thumbnail} alt={result.title} size="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50 truncate text-sm">
            {result.title}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
            {result.artist}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
            {formatTime(result.duration)}
          </p>
        </div>
        <Button
          onClick={() => onAdd(result.videoId)}
          disabled={isAdding}
          size="sm"
          className="shrink-0 h-9 px-4 text-sm bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-50 dark:to-gray-200 text-white dark:text-gray-900 rounded-[14px] hover:translate-y-0.5 transition-transform duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAdding ? "加入中..." : "加入"}
        </Button>
      </div>
    </Card>
  );
};
