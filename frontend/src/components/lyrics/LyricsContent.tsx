import { useRef, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty } from "@/components/ui/empty";
import { usePlayerStore } from "@/stores/playerStore";
import { useLyricSync } from "@/hooks/useLyricSync";
import { cn } from "@/lib/utils";

interface LyricsContentProps {
  className?: string;
  /**
   * 變體樣式
   * - `default`: 預設模式（淺色背景）
   * - `dark`: 深色背景模式（全螢幕播放器使用）
   */
  variant?: "default" | "dark";
}

export const LyricsContent = ({
  className,
  variant = "default",
}: LyricsContentProps) => {
  const lyrics = usePlayerStore((state) => state.lyrics);
  const { currentIndex } = useLyricSync();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  // 根據 variant 決定顏色樣式
  const colorStyles = {
    default: {
      active: "text-lg font-semibold text-gray-900 dark:text-gray-50 scale-105",
      inactive: "text-sm text-gray-500 dark:text-gray-400",
    },
    dark: {
      active: "text-lg font-semibold text-white scale-105",
      inactive: "text-sm text-gray-300",
    },
  };

  // 自動捲動到當前歌詞行，使用 scrollTop 避免滾動整個頁面
  useEffect(() => {
    if (scrollAreaRef.current && activeRef.current && containerHeight > 0) {
      const scrollArea = scrollAreaRef.current;
      const activeLine = activeRef.current;

      // 計算當前歌詞行相對於 ScrollArea 的位置
      const scrollAreaRect = scrollArea.getBoundingClientRect();
      const activeRect = activeLine.getBoundingClientRect();
      const relativeTop =
        activeRect.top - scrollAreaRect.top + scrollArea.scrollTop;

      // 將當前行滾動到 ScrollArea 的中央
      const targetScroll =
        relativeTop - scrollArea.clientHeight / 2 + activeRect.height / 2;

      scrollArea.scrollTo({
        top: targetScroll,
        behavior: "smooth",
      });
    }
  }, [currentIndex, containerHeight]);

  // 使用 ResizeObserver 監聽容器大小變化，動態設置佔位元素高度
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(scrollArea);
    return () => resizeObserver.disconnect();
  }, []);

  if (lyrics.length === 0) {
    return <Empty title="沒有歌詞" description="此歌曲沒有可用的歌詞" />;
  }

  // 佔位元素高度為容器高度的一半，使歌詞可以置中顯示
  const spacerHeight = containerHeight / 2;

  return (
    <ScrollArea
      ref={scrollAreaRef}
      className={cn("w-full h-full", className)}
      maxHeight="100%"
    >
      <div className="space-y-2 py-4 px-4">
        {lyrics.map((line, index) => (
          <div
            key={index}
            ref={index === currentIndex ? activeRef : null}
            className={cn(
              "py-2 text-center transition-all duration-300",
              index === currentIndex
                ? colorStyles[variant].active
                : colorStyles[variant].inactive,
            )}
          >
            {line.text}
          </div>
        ))}

        {/* 底部佔位元素，使最後一行歌詞可以滾動到中央 */}
        <div style={{ height: spacerHeight }} />
      </div>
    </ScrollArea>
  );
};
