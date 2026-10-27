import type { ReactNode } from "react"
import type { LayoutHost, LayoutStatus } from "./contract"
import type { LayoutScope } from "./core"
import type { LayoutRenderReport, LayoutSpeakOptions, LayoutWarnHandler } from "./dom"
import { useLayoutEffect, useRef, useState } from "react"
import { LayoutRenderer } from "./dom"

/**
 * A layout in an isolated shadow root. It re-renders whenever its inputs
 * change and reports what is on screen; when neither the layout nor any
 * fallback source can render, it shows `fallback` instead. `className` goes
 * on the frame around the shadow host.
 */

export interface LayoutViewProps {
  host: LayoutHost
  theme: "light" | "dark"
  source: string
  scope: LayoutScope
  status: LayoutStatus
  fallbackSources?: readonly string[]
  speak?: LayoutSpeakOptions
  onReport?: (report: LayoutRenderReport) => void
  onWarn?: LayoutWarnHandler
  className?: string
  fallback?: ReactNode
}

export function LayoutView({
  host,
  theme,
  source,
  scope,
  status,
  fallbackSources,
  speak,
  onReport,
  onWarn,
  className,
  fallback,
}: LayoutViewProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<LayoutRenderer | null>(null)
  const [failed, setFailed] = useState(false)
  // The latest callbacks, so a new one on every render costs nothing.
  const callbacks = useRef({ onReport, onWarn })
  useLayoutEffect(() => {
    callbacks.current = { onReport, onWarn }
  })

  useLayoutEffect(() => {
    const element = hostRef.current
    if (!element) return undefined
    const renderer = new LayoutRenderer(element, {
      onWarn: (code, detail) => callbacks.current.onWarn?.(code, detail),
    })
    rendererRef.current = renderer
    return () => {
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    rendererRef.current?.setSpeak(speak)
  }, [speak])

  useLayoutEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const report = renderer.render({
      source,
      scope,
      status,
      theme,
      fallbackSources,
      maxSourceLength: host.maxSourceLength,
    })
    // oxlint-disable-next-line react/set-state-in-effect -- whether anything rendered is only known after rendering into the shadow root
    setFailed(report.fellBack === "component")
    callbacks.current.onReport?.(report)
  }, [source, scope, status, theme, fallbackSources, host])

  return (
    <div className={className}>
      <div ref={hostRef} hidden={failed} />
      {failed && fallback}
    </div>
  )
}
