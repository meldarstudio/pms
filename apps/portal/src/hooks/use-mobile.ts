import * as React from "react";

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => {
      setMatches(mql.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 767px)");
}

export function useIsCompact() {
  const narrow = useMediaQuery("(max-width: 1279px)");
  const touch = useMediaQuery("(pointer: coarse) and (max-width: 1535px)");
  return narrow || touch;
}
