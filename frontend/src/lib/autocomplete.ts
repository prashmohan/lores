import type { PersonRead, PersonSummary } from '../types/api';

/**
 * Extracts a deduplicated and sorted list of places from existing people in the workspace.
 */
export function extractKnownPlaces(people: (PersonRead | PersonSummary)[] = []): string[] {
  const places = new Set<string>();
  people.forEach((p) => {
    if (p.birth_place && p.birth_place.trim()) {
      places.add(p.birth_place.trim());
    }
    if (p.death_place && p.death_place.trim()) {
      places.add(p.death_place.trim());
    }
  });
  return Array.from(places).sort((a, b) => a.localeCompare(b));
}

/**
 * Generates an array of year suggestions descending from the current year back to 1800.
 */
export function generateYearSuggestions(startYear = 1800, endYear = new Date().getFullYear()): string[] {
  const years: string[] = [];
  for (let y = endYear; y >= startYear; y--) {
    years.push(y.toString());
  }
  return years;
}
