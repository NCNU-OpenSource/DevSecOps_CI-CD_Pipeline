import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LyricsContent } from "./LyricsContent";

export const LyricsDisplay = () => {
  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="text-lg">歌詞</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden min-h-0">
        <LyricsContent />
      </CardContent>
    </Card>
  );
};
