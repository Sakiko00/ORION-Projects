'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ListMusic,
  Shuffle,
  Repeat,
  Repeat1,
  Music,
  Minimize2,
  Maximize2,
  AlertCircle,
} from 'lucide-react';
import { connectAudioElement, resumeAudioContext } from '@/lib/audio-context';

interface Track {
  title: string;
  artist: string;
  src: string;
}

const TRACKS: Track[] = [
  { title: '太空漫步 Space Walk', artist: 'HOYO-MiX', src: '/music/太空漫步.mp3' },
  { title: 'Listen', artist: 'ONE OK ROCK, Avril Lavigne', src: '/music/Listen.mp3' },
  { title: 'One Last Kiss', artist: '宇多田ヒカル', src: '/music/One Last Kiss.mp3' },
  { title: 'more than words', artist: '羊文学', src: '/music/more than words.mp3' },
  { title: 'BE ME', artist: 'Doul', src: '/music/BE ME.mp3' },
  { title: 'Gion2', artist: 'HOYO-MiX', src: '/music/Gion2.mp3' },
  { title: 'Loneliness', artist: 'Jux', src: '/music/Loneliness.mp3' },
  { title: 'Beneath the Mask', artist: 'Lyn, アトラスサウンドチーム', src: '/music/Beneath the Mask.mp3' },
  { title: '60%的遐想·静谧', artist: '三Z-STUDIO, HOYO-MiX', src: '/music/60的遐想.mp3' },
  { title: '开启新征程', artist: '阿鲲', src: '/music/开启新征程.mp3' },
];

type LoopMode = 'none' | 'all' | 'one';

export function MusicPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [showVolume, setShowVolume] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loopMode, setLoopMode] = useState<LoopMode>('all');
  const [isShuffle, setIsShuffle] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMinimized, setIsMinimized] = useState(true);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shuffledIndices = useRef<number[]>([]);
  const shuffleIndex = useRef(0);

  const currentTrack = TRACKS[currentIndex];

  const buildShuffleOrder = useCallback(() => {
    const indices = TRACKS.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    if (indices[0] === currentIndex && indices.length > 1) {
      const swapIdx = indices.findIndex((i) => i !== currentIndex);
      if (swapIdx > 0) [indices[0], indices[swapIdx]] = [indices[swapIdx], indices[0]];
    }
    shuffledIndices.current = indices;
    shuffleIndex.current = 0;
  }, [currentIndex]);

  // 初始化音频（只创建一次）
  useEffect(() => {
    const audio = new Audio(TRACKS[0].src);
    audio.volume = volume;
    audioRef.current = audio;

    // Connect to shared AudioContext for visualization
    try {
      connectAudioElement(audio);
    } catch {
      // May fail if AudioContext not yet allowed; will retry on play
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    const onEnded = () => {
      // 通过读取最新的 state ref 来决定行为
      if (audioRef.current?.loop) return; // 单曲循环由 loop 属性处理
      handleNextRef.current();
    };
    const onError = () => {
      // Silently handle missing audio files instead of console.error
      setIsPlaying(false);
      setHasError(true);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步 src / loop / currentIndex 到 audio 元素
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const newSrc = TRACKS[currentIndex].src;
    if (audio.src !== newSrc && audio.src !== window.location.origin + newSrc) {
      audio.src = newSrc;
      audio.load();
      setDuration(0);
      setCurrentTime(0);
      setProgress(0);
      setHasError(false);
    }
    audio.loop = loopMode === 'one';
  }, [currentIndex, loopMode]);

  // 播放状态同步
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // 音量同步
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handleNextRef = useRef(() => {});

  const handleNext = useCallback(() => {
    setIsPlaying(false); // 先暂停当前
    setTimeout(() => {
      if (isShuffle) {
        if (shuffledIndices.current.length === 0) buildShuffleOrder();
        const nextShuffleIdx = (shuffleIndex.current + 1) % shuffledIndices.current.length;
        shuffleIndex.current = nextShuffleIdx;
        setCurrentIndex(shuffledIndices.current[nextShuffleIdx]);
      } else {
        setCurrentIndex((i) => (i + 1) % TRACKS.length);
      }
      setIsPlaying(true);
    }, 10);
  }, [isShuffle, buildShuffleOrder]);

  const handlePrev = useCallback(() => {
    setIsPlaying(false);
    setTimeout(() => {
      if (isShuffle) {
        if (shuffledIndices.current.length === 0) buildShuffleOrder();
        const prevShuffleIdx = (shuffleIndex.current - 1 + shuffledIndices.current.length) % shuffledIndices.current.length;
        shuffleIndex.current = prevShuffleIdx;
        setCurrentIndex(shuffledIndices.current[prevShuffleIdx]);
      } else {
        setCurrentIndex((i) => (i - 1 + TRACKS.length) % TRACKS.length);
      }
      setIsPlaying(true);
    }, 10);
  }, [isShuffle, buildShuffleOrder]);

  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  const handleTrackClick = (index: number) => {
    if (index === currentIndex) {
      togglePlay();
      return;
    }
    setIsPlaying(false);
    setTimeout(() => {
      setCurrentIndex(index);
      setIsPlaying(true);
    }, 10);
  };

  const togglePlay = () => {
    setIsPlaying((p) => !p);
    resumeAudioContext();
  };

  const toggleShuffle = () => {
    setIsShuffle((s) => {
      if (!s) buildShuffleOrder();
      return !s;
    });
  };

  const toggleLoop = () => {
    setLoopMode((m) => {
      const next: LoopMode = m === 'none' ? 'all' : m === 'all' ? 'one' : 'none';
      return next;
    });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const toggleMute = () => {
    setVolume((v) => (v > 0 ? 0 : 0.3));
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const newTime = ratio * audio.duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(ratio * 100);
  };

  const formatTime = (t: number) => {
    if (!isFinite(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 font-mono">
      {/* 播放列表面板（仅展开时显示） */}
      {!isMinimized && showPlaylist && (
        <div className="bg-card/95 backdrop-blur-xl border border-primary/20 rounded-none p-4 shadow-xl animate-fade-in w-72 relative">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-primary/40" />
          <div className="flex items-center gap-2 mb-3">
            <ListMusic className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold tracking-wider uppercase text-primary">Playlist</span>
            <span className="text-[10px] text-muted-foreground ml-auto">{TRACKS.length} tracks</span>
          </div>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {TRACKS.map((track, i) => (
              <button
                key={i}
                onClick={() => handleTrackClick(i)}
                className={`w-full text-left px-3 py-2 text-xs transition-all border-l-2 ${
                  i === currentIndex
                    ? 'bg-primary/10 text-primary font-medium border-primary'
                    : 'hover:bg-muted text-muted-foreground border-transparent hover:border-primary/30'
                }`}
              >
                <div className="truncate">{track.title}</div>
                <div className="truncate text-[10px] opacity-60">{track.artist}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 音量控制面板（仅展开时显示） */}
      {!isMinimized && showVolume && (
        <div className="flex items-center gap-3 bg-card/90 backdrop-blur-xl border border-primary/20 rounded-none px-4 py-2 shadow-lg animate-fade-in">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="h-8 w-8 text-muted-foreground hover:text-primary"
          >
            {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-24 h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(volume * 100)}%</span>
        </div>
      )}

      {isMinimized ? (
        /* 最小化状态 — 构成主义工业风 */
        <div
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 bg-card/90 backdrop-blur-xl border border-primary/20 rounded-none px-3 py-2 shadow-lg hover:shadow-primary/10 transition-all hover:scale-105 group cursor-pointer relative"
        >
          <div className="absolute top-0 left-0 w-[3px] h-full bg-primary" />
          <div className={`h-7 w-7 rounded-none border border-primary/30 flex items-center justify-center shrink-0 ${isPlaying ? 'animate-pulse' : ''}`}>
            <Music className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex flex-col min-w-0 max-w-[140px]">
            <span className="text-xs font-medium truncate">{currentTrack.title}</span>
            <span className="text-[10px] text-muted-foreground truncate">{currentTrack.artist}</span>
          </div>
          <div className="w-px h-5 bg-border/50 mx-0.5" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="h-7 w-7 rounded-none border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/10 transition-all"
          >
            {hasError ? <AlertCircle className="h-3.5 w-3.5 text-destructive" /> : isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
          </button>
          {hasError && <span className="text-[10px] text-destructive/80 truncate max-w-16">文件丢失</span>}
          <Maximize2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
        </div>
      ) : (
        /* 展开状态 — 构成主义工业风 */
        <div className="flex items-center gap-2">
          {/* 展开控制按钮 */}
          <div className="flex items-center gap-1 bg-card/90 backdrop-blur-xl border border-primary/20 rounded-none px-2 py-1.5 shadow-lg">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPlaylist((s) => !s)}
              className={`h-7 w-7 rounded-none transition-colors ${showPlaylist ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
            >
              <ListMusic className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowVolume((s) => !s)}
              className={`h-7 w-7 rounded-none transition-colors ${showVolume ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
            >
              {volume === 0 ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMinimized(true)}
              className="h-7 w-7 rounded-none text-muted-foreground hover:text-primary transition-colors"
              title="最小化"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* 主控制面板 */}
          <div className="flex items-center gap-1.5 bg-card/90 backdrop-blur-xl border border-primary/20 rounded-none px-3 py-2 shadow-lg relative">
            <div className="absolute top-0 left-0 w-[3px] h-full bg-primary" />
            {/* 曲目信息 */}
            <div className="flex items-center gap-2 mr-1 min-w-0">
              <div className={`h-7 w-7 rounded-none border border-primary/30 flex items-center justify-center shrink-0 ${isPlaying ? 'animate-pulse' : ''}`}>
                <Music className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex flex-col min-w-0 hidden sm:flex">
                <span className="text-xs font-medium truncate max-w-[120px]">{currentTrack.title}</span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{currentTrack.artist}</span>
              </div>
            </div>

            {/* 进度条 */}
            <div className="hidden md:flex flex-col gap-0.5 w-24">
              <div
                className="h-1 bg-muted cursor-pointer relative overflow-hidden border border-primary/10"
                onClick={handleProgressClick}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* 控制按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleShuffle}
              className={`h-7 w-7 rounded-none transition-colors ${isShuffle ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
              title="随机播放"
            >
              <Shuffle className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              className="h-7 w-7 rounded-none text-muted-foreground hover:text-primary transition-colors"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="h-8 w-8 rounded-none border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all hover:scale-105"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              className="h-7 w-7 rounded-none text-muted-foreground hover:text-primary transition-colors"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLoop}
              className={`h-7 w-7 rounded-none transition-colors ${loopMode !== 'none' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
              title={loopMode === 'one' ? '单曲循环' : loopMode === 'all' ? '列表循环' : '顺序播放'}
            >
              {loopMode === 'one' ? <Repeat1 className="h-3.5 w-3.5" /> : <Repeat className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
