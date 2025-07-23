import { useState, useEffect } from 'react';

interface PlaylistProgress {
  loaded: number;
  total: number;
  percentage: number;
  isLoading: boolean;
}

export function usePlaylistProgress() {
  const [progress, setProgress] = useState<PlaylistProgress>({
    loaded: 0,
    total: 0,
    percentage: 0,
    isLoading: false,
  });

  // Listen for progress events from the console logs
  useEffect(() => {
    const originalConsoleLog = console.log;
    
    console.log = (...args) => {
      const message = args.join(' ');
      
      // Look for progress messages from the API
      if (message.includes('📊 Progress:')) {
        const match = message.match(/(\d+)\/(\d+) items loaded/);
        if (match) {
          const loaded = parseInt(match[1]);
          const total = parseInt(match[2]);
          const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
          
          setProgress({
            loaded,
            total,
            percentage,
            isLoading: loaded < total,
          });
        }
      }
      
      // Reset progress when starting to load
      if (message.includes('🎵 Fetching playlist items for playlist:')) {
        setProgress({
          loaded: 0,
          total: 0,
          percentage: 0,
          isLoading: true,
        });
      }
      
      // Mark as complete when finished
      if (message.includes('🎵 Successfully loaded') && message.includes('total playlist items')) {
        const match = message.match(/(\d+) total playlist items/);
        if (match) {
          const total = parseInt(match[1]);
          setProgress({
            loaded: total,
            total,
            percentage: 100,
            isLoading: false,
          });
        }
      }
      
      // Call original console.log
      originalConsoleLog.apply(console, args);
    };

    return () => {
      console.log = originalConsoleLog;
    };
  }, []);

  return progress;
}
