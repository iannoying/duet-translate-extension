// What the DOM layer tells its host page, and what it needs from it.

export interface LayoutRenderReport {
  // Why the requested layout is not the one on screen.
  error?: { message: string }
  // What the sanitizer took out of the layout on screen.
  removed: readonly string[]
  // "none": the requested layout is shown; "source": a fallback source is
  // shown instead; "component": nothing could render, and the host shows its
  // own fallback.
  fellBack: "none" | "source" | "component"
}

// Things worth logging that change nothing on screen.
export type LayoutWarnCode = "constructableStylesheetUnavailable" | "speakFailed" | "copyFailed"

export type LayoutWarnHandler = (code: LayoutWarnCode, detail?: unknown) => void

export interface SpeakPlayOptions {
  // A BCP 47 tag from `data-speak-lang` or the nearest `lang`; undefined to detect.
  lang?: string
  // Aborted when the run is stopped or replaced.
  signal: AbortSignal
  // Called once the audio actually starts.
  onStart: () => void
  // Started by `data-speak-autoplay`, not by a press.
  autoplay?: boolean
}

export interface SpeakAdapter {
  play: (text: string, options: SpeakPlayOptions) => Promise<unknown>
  stop: () => void
}

// The accessible names of a speak trigger in each state.
export interface SpeakLabels {
  speak: string
  loading: string
  playing: string
}

export interface LayoutSpeakOptions {
  adapter: SpeakAdapter
  labels: SpeakLabels
  // Reads the first `data-speak-autoplay` trigger once the answer is done.
  autoplay: boolean
}
