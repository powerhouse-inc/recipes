declare module "cli-progress" {
  interface Options {
    format?: string;
    barCompleteChar?: string;
    barIncompleteChar?: string;
    hideCursor?: boolean;
    clearOnComplete?: boolean;
    stopOnComplete?: boolean;
    noTTYOutput?: boolean;
  }

  interface Preset {}

  class SingleBar {
    update(value: number, payload?: Record<string, unknown>): void;
    stop(): void;
  }

  class MultiBar {
    constructor(options: Options, preset?: Preset);
    create(
      total: number,
      startValue: number,
      payload?: Record<string, unknown>,
    ): SingleBar;
    update(): void;
    stop(): void;
  }

  const Presets: {
    shades_classic: Preset;
    shades_grey: Preset;
    rect: Preset;
    legacy: Preset;
  };

  export { SingleBar, MultiBar, Options, Preset, Presets };
  export default { SingleBar, MultiBar, Presets };
}
