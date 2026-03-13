import { useState, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePlayerStore } from "@/stores/playerStore";
import { MainLayout } from "@/components/layout/MainLayout";
import { SearchModal } from "@/components/search/SearchModal";
import { PlayerSection } from "@/components/player/PlayerSection";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { TabBar } from "@/components/mobile/TabBar";
import { QueueSection } from "@/components/queue/QueueSection";
import { LyricsDisplay } from "@/components/lyrics/LyricsDisplay";
import { MobileContent } from "@/components/mobile/MobileContent";
import { LibraryContent } from "@/components/mobile/LibraryContent";
import { ToastProvider } from "@/components/ui/toast";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsIndicator,
  TabsContent,
} from "@/components/ui/tabs";

function App() {
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const mobileActiveTab = usePlayerStore((state) => state.mobileActiveTab);

  // 初始化 WebSocket 連接
  useWebSocket();

  // 穩定的函數引用，避免不必要的事件監聽器重新綁定
  // 只用於桌面版搜尋彈窗
  const handleSearchOpen = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  // 初始化全局快捷鍵
  useKeyboardShortcuts({
    onSearchOpen: handleSearchOpen,
  });

  return (
    <ToastProvider>
      <MainLayout onSearchClick={handleSearchOpen}>
        {/* 桌面版：雙欄佈局 */}
        <div className="hidden lg:grid lg:grid-cols-2 gap-6 h-full">
          {/* 左側：播放器 */}
          <div className="flex flex-col gap-6">
            <PlayerSection />
          </div>

          {/* 右側：標籤切換（歌詞/播放佇列） */}
          <div className="flex flex-col gap-6 h-full">
            <div className="flex-1 min-h-0">
              <Tabs defaultValue="lyrics" className="h-full flex flex-col">
                <div className="pb-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="lyrics">歌詞</TabsTrigger>
                    <TabsTrigger value="queue">播放佇列</TabsTrigger>
                    <TabsIndicator />
                  </TabsList>
                </div>
                <TabsContent
                  value="lyrics"
                  className="flex-1 overflow-hidden mt-0"
                >
                  <LyricsDisplay />
                </TabsContent>
                <TabsContent
                  value="queue"
                  className="flex-1 overflow-hidden mt-0"
                >
                  <QueueSection />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>

        {/* 手機版：根據 TabBar 狀態動態切換內容 */}
        <div className="lg:hidden h-full">
          {mobileActiveTab === "search" && <MobileContent />}
          {mobileActiveTab === "lyrics" && (
            <div className="h-full pb-[168px] overflow-hidden">
              <LyricsDisplay />
            </div>
          )}
          {mobileActiveTab === "queue" && (
            <div className="h-full pb-[168px] overflow-hidden">
              <QueueSection />
            </div>
          )}
          {mobileActiveTab === "library" && <LibraryContent />}
        </div>
      </MainLayout>

      {/* 手機版底部迷你播放器 */}
      <MiniPlayer />

      {/* 手機版底部 TabBar */}
      <TabBar />

      {/* 桌面版搜尋彈窗 */}
      <SearchModal
        open={isSearchModalOpen}
        onOpenChange={setIsSearchModalOpen}
      />
    </ToastProvider>
  );
}

export default App;
