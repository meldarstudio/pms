import { useEffect, useState } from "react";

/** Below the `md` breakpoint, where pop-ups open as bottom drawers like the stay search's. */
export function useNarrowScreen() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 48rem)");
    const update = () => setNarrow(!media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}
