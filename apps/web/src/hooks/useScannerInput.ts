import { useEffect, useRef } from "react";

interface UseScannerInputOptions {
  onScan: (code: string) => void;
  thresholdMs?: number; // max time between keystrokes (default: 50ms)
  minCharacters?: number; // min characters for a scan (default: 6)
}

/**
 * A custom React hook that captures fast keyboard scan events.
 * Barcode scanner guns act as keyboard emulators, typing characters extremely quickly
 * (typically less than 30ms apart) and ending with an "Enter" keypress.
 *
 * This hook measures the typing speed and triggers onScan only when the timing
 * matches a hardware scanner, ignoring slower human keystrokes or input elements.
 */
export function useScannerInput({
  onScan,
  thresholdMs = 50,
  minCharacters = 6,
}: UseScannerInputOptions) {
  const keystrokesRef = useRef<{ key: string; time: number }[]>([]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;

      // 1. Ignore keyboard events if focusing on text inputs, textareas or select fields
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // 2. Ignore single modifier keys (Shift, Ctrl, Alt, CapsLock, etc.)
      if (event.key.length > 1 && event.key !== "Enter") {
        return;
      }

      const now = Date.now();

      // 3. Handle Enter key (ends scanner stream)
      if (event.key === "Enter") {
        const keystrokes = keystrokesRef.current;
        keystrokesRef.current = []; // Reset for next scan

        if (keystrokes.length < minCharacters) {
          return;
        }

        // Check if all consecutive characters were entered fast enough
        let isScanner = true;
        for (let i = 1; i < keystrokes.length; i++) {
          const diff = keystrokes[i].time - keystrokes[i - 1].time;
          if (diff > thresholdMs) {
            isScanner = false;
            break;
          }
        }

        // Check if the delay between the last character and Enter is fast enough
        const lastCharTime = keystrokes[keystrokes.length - 1].time;
        if (now - lastCharTime > thresholdMs) {
          isScanner = false;
        }

        if (isScanner) {
          const code = keystrokes.map((k) => k.key).join("");
          onScan(code);
        }
        return;
      }

      // 4. Reset sequence if too much time has passed since the last keypress
      const keystrokes = keystrokesRef.current;
      if (keystrokes.length > 0) {
        const lastKey = keystrokes[keystrokes.length - 1];
        if (now - lastKey.time > thresholdMs) {
          keystrokesRef.current = [];
        }
      }

      // 5. Append key and timestamp
      keystrokesRef.current.push({ key: event.key, time: now });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onScan, thresholdMs, minCharacters]);
}
