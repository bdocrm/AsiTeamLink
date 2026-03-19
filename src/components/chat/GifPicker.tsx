'use client';

import { useState, useEffect } from 'react';
import { Search, X, Loader } from 'lucide-react';

interface GifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string) => void;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
    };
  };
}

export function GifPicker({ isOpen, onClose, onSelectGif }: GifPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchGifs = async (query: string) => {
    if (!query.trim()) {
      setGifs([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/gifs/search?q=${encodeURIComponent(query)}&limit=20`
      );
      const data = await response.json();

      if (data.data) {
        setGifs(data.data);
      } else {
        setError('No GIFs found');
        setGifs([]);
      }
    } catch (err) {
      setError('Failed to load GIFs');
      setGifs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchGifs(searchQuery);
  };

  useEffect(() => {
    if (!isOpen) return;
    // Load trending GIFs on open
    const loadTrending = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/gifs/trending?limit=20`);
        const data = await response.json();
        if (data.data) {
          setGifs(data.data);
        }
      } catch (err) {
        console.error('Failed to load trending GIFs');
      } finally {
        setLoading(false);
      }
    };
    loadTrending();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Search GIFs</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search GIFs..."
              className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 text-sm text-danger bg-danger/10 border-b border-border">
            {error}
          </div>
        )}

        {/* GIF Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : gifs.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  onClick={() => {
                    onSelectGif(gif.images.fixed_height.url);
                    onClose();
                  }}
                  className="group relative overflow-hidden rounded-lg border border-border hover:border-primary transition-all"
                  title={gif.title}
                >
                  <img
                    src={gif.images.fixed_height.url}
                    alt={gif.title}
                    className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted">
              {searchQuery ? 'No GIFs found' : 'Search for GIFs or browse trending'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border text-xs text-muted text-center">
          Powered by GIPHY
        </div>
      </div>
    </div>
  );
}
