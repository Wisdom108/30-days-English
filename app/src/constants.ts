// App-level constants that must not drag data files (lessons.json via
// curriculum.ts) into the shell chunk. App.tsx reads TOTAL_DAYS from here;
// lesson components keep importing it from data/curriculum.
export const TOTAL_DAYS = 30
