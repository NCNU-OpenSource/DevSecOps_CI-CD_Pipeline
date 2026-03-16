import type { ArtworkThemeState } from "@/hooks/useArtworkTheme";
import { ArtworkThemeBackdrop } from "./ArtworkThemeBackdrop";
import { Header } from "./Header";

interface MainLayoutProps {
  children: React.ReactNode;
  onSearchClick?: () => void;
  artworkTheme: ArtworkThemeState;
}

export const MainLayout = ({
  children,
  onSearchClick,
  artworkTheme,
}: MainLayoutProps) => {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <ArtworkThemeBackdrop theme={artworkTheme} />
      <div className="relative z-10 flex h-screen flex-col overflow-hidden">
        <Header onSearchClick={onSearchClick} />
        <main className="flex-1 overflow-hidden min-h-0">
          {/* 桌面版：有 padding 和 max-width */}
          <div className="mx-auto hidden h-full min-h-0 max-w-[1480px] px-4 py-4 lg:block xl:px-6 xl:py-5">
            {children}
          </div>
          {/* 手機版：全高度 */}
          <div className="h-full lg:hidden">{children}</div>
        </main>
      </div>
    </div>
  );
};
