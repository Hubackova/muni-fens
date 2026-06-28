import { useEffect, useRef, useState } from "react";
import { API_ROOT, fetchJson } from "../api";
import type { SpeciesSearchResult } from "./types";

type Props = {
  selected: SpeciesSearchResult | null;
  onSelect: (value: SpeciesSearchResult | null) => void;
  placeholder?: string;
};

const DEBOUNCE_MS = 250;

// Type-ahead for picking an existing valid species (used for sp_previous).
// The user never types an ID – they search by name and pick a result.
function SpeciesAutocomplete({ selected, onSelect, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpeciesSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the result list when clicking outside.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!q) {
        setResults([]);
        return;
      }
      try {
        setIsSearching(true);
        const data = await fetchJson<SpeciesSearchResult[]>(
          `${API_ROOT}/species/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        setResults(data);
        setOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (selected) {
    return (
      <div className="autocomplete" ref={containerRef}>
        <div className="autocomplete-chip">
          <span>
            {selected.name} <small>#{selected.id}</small>
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              onSelect(null);
              setQuery("");
            }}
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="autocomplete" ref={containerRef}>
      <input
        value={query}
        placeholder={placeholder ?? "Search species..."}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <ul className="autocomplete-list">
          {isSearching && <li className="autocomplete-empty">Searching...</li>}
          {!isSearching && results.length === 0 && query.trim() && (
            <li className="autocomplete-empty">No matches.</li>
          )}
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                }}
              >
                {r.name} <small>#{r.id}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SpeciesAutocomplete;
