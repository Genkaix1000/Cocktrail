"use client";

import { useEffect, useState } from "react";

export default function AnimatedNumber({ value, isCurrency = false }: { value: number; isCurrency?: boolean }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const end = value;
    if (end === 0) {
      setDisplayValue(0);
      return;
    }

    const totalDuration = 700; // ms
    const frameDuration = 1000 / 60; // 60 fps
    const totalFrames = Math.round(totalDuration / frameDuration);
    let frame = 0;

    const counter = setInterval(() => {
      frame++;
      const progress = Math.min(1, frame / totalFrames);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(end * easeProgress);

      setDisplayValue(currentVal);

      if (frame >= totalFrames) {
        setDisplayValue(end);
        clearInterval(counter);
      }
    }, frameDuration);

    return () => clearInterval(counter);
  }, [value]);

  return (
    <>
      {isCurrency && <span className="text-ink-500 text-[0.7em] mr-0.5">$</span>}
      {displayValue.toLocaleString("es-AR")}
    </>
  );
}
