'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Play, Video, ChevronLeft } from 'lucide-react';

// 视频作品数据
const videoWorks = [
  {
    id: 1,
    title: '《梦醒｜所立皆为未来》',
    description: 'ORION AI Studio 出品 — AI生成视频作品，探索梦境与未来的交织',
    duration: '3:24',
    thumbnail: '/hero-bg.png',
    videoSrc: '/videos/mengxing.mp4',
    tags: ['AIGC', 'AI视频', '原创'],
  },
];

interface VideoShowcaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoShowcaseDialog({ open, onOpenChange }: VideoShowcaseDialogProps) {
  const [activeVideo, setActiveVideo] = useState<typeof videoWorks[0] | null>(null);

  const handleSelectVideo = (video: typeof videoWorks[0]) => {
    setActiveVideo(video);
  };

  const handleBack = () => {
    setActiveVideo(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-border/50">
        {!activeVideo ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Video className="w-5 h-5 text-primary" />
                AIGC · 作品列表
              </DialogTitle>
              <DialogDescription>
                探索我们使用AI技术生成的创意作品
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 mt-2">
              {videoWorks.map((work) => (
                <div
                  key={work.id}
                  onClick={() => handleSelectVideo(work)}
                  className="group flex items-center gap-4 p-4 rounded-xl bg-background/50 border border-border/50 hover:border-primary/30 cursor-pointer transition-all duration-300"
                >
                  {/* 缩略图 */}
                  <div className="relative w-32 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Play className="w-8 h-8 text-primary/50 group-hover:text-primary group-hover:scale-110 transition-all duration-300" />
                    </div>
                    <div className="absolute bottom-1 right-1 bg-background/80 text-xs px-1.5 py-0.5 rounded text-muted-foreground">
                      {work.duration}
                    </div>
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm group-hover:text-primary transition-colors duration-300">
                      {work.title}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {work.description}
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      {work.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* 箭头 */}
                  <div className="text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all duration-300">
                    <Play className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-300 mb-1 w-fit"
              >
                <ChevronLeft className="w-4 h-4" />
                返回列表
              </button>
              <DialogTitle className="flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" />
                {activeVideo.title}
              </DialogTitle>
              <DialogDescription>
                {activeVideo.description}
              </DialogDescription>
            </DialogHeader>

            {/* 视频播放器 */}
            <div className="mt-2 rounded-xl overflow-hidden bg-black border border-border/30">
              <video
                key={activeVideo.id}
                controls
                className="w-full aspect-video"
                preload="metadata"
              >
                <source src={activeVideo.videoSrc} type="video/mp4" />
                您的浏览器不支持视频播放
              </video>
            </div>

            <div className="flex items-center gap-2 mt-2">
              {activeVideo.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                时长 {activeVideo.duration}
              </span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
