import { useCallback, useEffect, useRef, useState } from "react";

type Confirmation<T> = { value: T; settle: (proceed: boolean) => void };

export function useConfirmation<T>() {
  const [confirmation, setConfirmation] = useState<Confirmation<T> | null>(null);
  const current = useRef<Confirmation<T> | null>(null);
  const close = useCallback((proceed: boolean) => {
    const pending = current.current;
    current.current = null;
    setConfirmation(null);
    pending?.settle(proceed);
  }, []);
  const request = useCallback((value: T) => {
    current.current?.settle(false);
    return new Promise<boolean>((settle) => {
      const pending = { value, settle };
      current.current = pending;
      setConfirmation(pending);
    });
  }, []);
  useEffect(
    () => () => {
      current.current?.settle(false);
      current.current = null;
    },
    [],
  );
  return { value: confirmation?.value ?? null, request, close };
}
