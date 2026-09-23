import { useEffect, useRef, useState } from 'react';

export const useDictationCountdown = (onSend: () => void) => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setSeconds(null);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const start = () => {
    cancel();
    let remaining = 3;
    setSeconds(remaining);
    const tick = () => {
      remaining -= 1;
      if (remaining === 0) {
        timer.current = null;
        setSeconds(null);
        onSend();
      } else {
        setSeconds(remaining);
        timer.current = setTimeout(tick, 1000);
      }
    };
    timer.current = setTimeout(tick, 1000);
  };
  return { seconds, start, cancel };
};
