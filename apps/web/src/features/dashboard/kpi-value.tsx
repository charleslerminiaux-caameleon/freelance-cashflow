"use client";

import { useLayoutEffect, useRef } from "react";

/** Fit the complete value to its card, keeping a readable minimum for long amounts. */
export function KpiValue({ children, className }: { children: string; className?: string }) {
  const valueRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const value = valueRef.current!;
    const text = textRef.current!;
    let active = true;
    let previousWidth = -1;
    const fit = () => {
      if (!active) return;
      text.style.removeProperty("font-size");
      const maximum = parseFloat(getComputedStyle(value).fontSize);
      const minimum = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.875;
      const naturalWidth = text.getBoundingClientRect().width;
      if (!naturalWidth) return;
      // Flex cards may move to another row before the value becomes unreadably small.
      value.style.minWidth = `${Math.ceil(naturalWidth * minimum / maximum)}px`;
      const available = value.getBoundingClientRect().width;
      text.style.fontSize = `${Math.max(minimum, Math.min(maximum, maximum * available / naturalWidth))}px`;
    };
    fit();
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width !== previousWidth) {
        previousWidth = entry.contentRect.width;
        fit();
      }
    });
    observer.observe(value);
    void document.fonts?.ready.then(fit);
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      active = false;
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [children]);

  return <strong ref={valueRef} className={className}><span ref={textRef}>{children}</span></strong>;
}
