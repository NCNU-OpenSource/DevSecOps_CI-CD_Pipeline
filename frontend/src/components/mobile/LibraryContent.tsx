import { Empty } from "@/components/ui/empty";

export const LibraryContent = () => {
  return (
    <div className="lg:hidden flex flex-col h-full items-center justify-center px-6">
      <Empty title="媒體庫" description="即將推出" />
      <div className="mt-8 text-center space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          未來功能規劃：
        </p>
        <ul className="text-xs text-gray-400 dark:text-gray-500 space-y-2">
          <li>• 播放歷史記錄</li>
          <li>• 喜愛的歌曲</li>
          <li>• 自訂播放清單</li>
          <li>• 離線下載</li>
        </ul>
      </div>
    </div>
  );
};
