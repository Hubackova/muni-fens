import { useEffect, useRef, useState } from "react";
import { fetchJson } from "./api";

const DEBOUNCE_MS = 250;
const WIDTH = 260;

type Props<T> = {
  // Builds the search URL for the typed query; the endpoints behind it cap the
  // number of hits, so the list is always a type-ahead, never a full dropdown.
  url: (query: string) => string;
  getKey: (item: T) => string | number;
  getLabel: (item: T) => string;
  getHint?: (item: T) => string;
  selected: T | null;
  onSelect: (item: T | null) => void;
  // Shown while nothing is picked - typically the value already stored.
  placeholder?: string;
};

// Type-ahead over one of the /*/search endpoints. The result list is rendered
// position:fixed so it survives the scrollable table wrapper and the modal.
function Autocomplete<T>({
  url,
  getKey,
  getLabel,
  getHint,
  selected,
  onSelect,
  placeholder,
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => setAnchor(null);

  // Close instead of following the anchor around, the way FilterDropdown does.
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        if (!q) {
          setResults([]);
          return;
        }
        try {
          setIsSearching(true);
          const data = await fetchJson<T[]>(url(q), {
            signal: controller.signal,
          });
          setResults(data);
          setAnchor(inputRef.current?.getBoundingClientRect() ?? null);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (selected) {
    return (
      <div className="autocomplete-chip">
        <span>
          {getLabel(selected)}
          {getHint && <small> {getHint(selected)}</small>}
        </span>
        <button
          type="button"
          className="link-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(null);
            setQuery("");
          }}
        >
          Change
        </button>
      </div>
    );
  }

  const left = anchor
    ? Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8))
    : 0;

  return (
    <>
      <input
        ref={inputRef}
        className="autocomplete-input"
        value={query}
        placeholder={placeholder ?? "Search..."}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
      />
      {anchor && (
        <ul
          className="autocomplete-list"
          style={{
            position: "fixed",
            top: anchor.bottom + 2,
            left,
            right: "auto",
            width: WIDTH,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {isSearching && <li className="autocomplete-empty">Searching...</li>}
          {!isSearching && results.length === 0 && (
            <li className="autocomplete-empty">No matches.</li>
          )}
          {results.map((item) => (
            <li key={getKey(item)}>
              <button
                type="button"
                onClick={() => {
                  onSelect(item);
                  close();
                }}
              >
                {getLabel(item)}
                {getHint && <small> {getHint(item)}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default Autocomplete;
