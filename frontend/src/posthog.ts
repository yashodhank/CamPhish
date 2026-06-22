import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST
const isEnabled = !!(POSTHOG_KEY && POSTHOG_HOST)

export function initPostHog() {
  if (!isEnabled || typeof window === 'undefined') return

  posthog.init(POSTHOG_KEY!, {
    api_host: POSTHOG_HOST!,
    ui_host: POSTHOG_HOST!.replace('.i.posthog.com', '.posthog.com'),
    capture_pageview: false,
    capture_pageleave: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '[data-ph-mask]',
    },
    loaded: (ph) => {
      ph.opt_in_capturing()
      ph.register_for_session({ $camphish_version: '2.1.0' })
    },
  })
}

export function capturePageView() {
  if (!isEnabled) return
  posthog.capture('$pageview')
}

export function captureException(error: Error, extra?: Record<string, unknown>) {
  if (!isEnabled) return
  posthog.captureException(error, extra)
}

export function capture(name: string, properties?: Record<string, unknown>) {
  if (!isEnabled) return
  posthog.capture(name, properties)
}

export default posthog
