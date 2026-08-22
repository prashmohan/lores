import { describe, it, expect } from 'vitest';
import { extractKnownPlaces, generateYearSuggestions } from '../src/lib/autocomplete';
import type { PersonRead } from '../src/types/api';

describe('autocomplete helpers', () => {
  it('extractKnownPlaces extracts and deduplicates birth and death places', () => {
    const people: Partial<PersonRead>[] = [
      {
        id: '1',
        birth_place: 'Boston, MA',
        death_place: 'Seattle, WA',
      },
      {
        id: '2',
        birth_place: 'Chennai, Tamil Nadu, India',
        death_place: 'Boston, MA',
      },
      {
        id: '3',
        birth_place: '   ',
        death_place: null,
      },
    ];

    const places = extractKnownPlaces(people as PersonRead[]);
    expect(places).toEqual(['Boston, MA', 'Chennai, Tamil Nadu, India', 'Seattle, WA']);
  });

  it('generateYearSuggestions generates descending years from current year', () => {
    const currentYear = new Date().getFullYear();
    const years = generateYearSuggestions(1900, currentYear);
    expect(years[0]).toBe(currentYear.toString());
    expect(years[years.length - 1]).toBe('1900');
    expect(years).toContain('1942');
  });
});
