declare module 'animejs' {
  interface AnimeParams {
    targets?: unknown;
    duration?: number;
    delay?: number | ((el: unknown, i: number, l: number) => number);
    easing?: string;
    loop?: boolean | number;
    direction?: 'normal' | 'reverse' | 'alternate';
    autoplay?: boolean;
    round?: boolean | number;
    update?: (anim: unknown) => void;
    begin?: (anim: unknown) => void;
    complete?: (anim: unknown) => void;
    [key: string]: unknown;
  }
  interface AnimeInstance {
    play(): void; pause(): void; restart(): void; reverse(): void;
    seek(time: number): void;
    finished: Promise<void>;
    began: boolean; paused: boolean; completed: boolean;
    currentTime: number; progress: number; duration: number;
    animatables: unknown[]; animations: unknown[];
  }
  interface AnimeTimelineInstance extends AnimeInstance {
    add(params: AnimeParams, offset?: string | number): this;
  }
  function anime(params: AnimeParams): AnimeInstance;
  namespace anime {
    function timeline(params?: AnimeParams): AnimeTimelineInstance;
    function stagger(value: number | string, options?: Record<string, unknown>): (el: unknown, i: number, l: number) => number;
    function random(min: number, max: number): number;
    function set(targets: unknown, props: Record<string, unknown>): void;
    function remove(targets: unknown): void;
    function path(path: string | HTMLElement): (el: unknown, i: number, l: number) => string;
  }
  export default anime;
}
