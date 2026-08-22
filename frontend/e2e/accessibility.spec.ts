import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const mockUser = {
  id: 'u-1',
  email: 'storykeeper@example.com',
  is_active: true,
  is_verified: true,
  created_at: '2026-08-23T00:00:00Z',
};

const mockWorkspace = {
  id: 'ws-1',
  name: 'The Miller Family',
  owner_id: 'u-1',
  created_at: '2026-08-23T00:00:00Z',
};

const mockMemberships = [
  {
    workspace: mockWorkspace,
    role: 'owner',
  },
];

const mockFocusPerson = {
  id: 'p-1',
  workspace_id: 'ws-1',
  first_name: 'Margaret',
  last_name: 'Miller',
  maiden_name: 'Higgins',
  gender: 'female',
  birth_date: '1942',
  birth_place: 'Boston, MA',
  is_living: true,
  death_date: null,
  death_place: null,
  notes: 'Beloved grandmother and oral storyteller.',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:00:00Z',
};

const mockNeighborhood = {
  focus_person: mockFocusPerson,
  parents: [
    {
      id: 'p-2',
      first_name: 'Arthur',
      last_name: 'Miller',
      gender: 'male',
      birth_date: '1915',
      death_date: '2005',
      is_living: false,
    },
  ],
  siblings: [
    {
      id: 'p-3',
      first_name: 'Robert',
      last_name: 'Miller',
      gender: 'male',
      birth_date: '1945',
      death_date: null,
      is_living: true,
    },
  ],
  partners: [
    {
      id: 'p-4',
      first_name: 'George',
      last_name: 'Vance',
      gender: 'male',
      birth_date: '1940',
      death_date: '2018',
      is_living: false,
    },
  ],
  children: [
    {
      id: 'p-5',
      first_name: 'Ronald',
      last_name: 'Vance',
      gender: 'male',
      birth_date: '1968',
      death_date: null,
      is_living: true,
    },
  ],
};

const mockPeople = [
  mockFocusPerson,
  ...mockNeighborhood.parents,
  ...mockNeighborhood.siblings,
  ...mockNeighborhood.partners,
  ...mockNeighborhood.children,
];

async function setupMockApi(page: import('@playwright/test').Page) {
  await page.route(/\/api\/v1\/.*/, async (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/auth/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
    }
    if (url.includes('/api/v1/workspaces') && !url.includes('/people') && !url.includes('/tree') && !url.includes('/audit') && !url.includes('/trash')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockMemberships) });
    }
    if (url.includes('/people')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPeople) });
    }
    if (url.includes('/tree/focus')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockNeighborhood) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript(() => {
    localStorage.setItem('lores_access_token', 'mock_jwt_token');
  });
}

test.describe('Automated E2E Accessibility (WCAG 2.1 AA / AAA)', () => {
  test('Login and OTP verification page has no accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Authenticated Focus Person View passes full page accessibility audit', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await expect(page.getByText('Margaret Miller').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Bird\'s-Eye Map view passes accessibility audit', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await page.getByRole('tab', { name: /Bird's-Eye Map/i }).click();
    await expect(page.getByRole('region', { name: /Family Tree Overview Map/i })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Add Relative modal dialog passes accessibility audit', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await page.getByRole('button', { name: /\+ Add Child/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Guided Interview modal dialog passes accessibility audit', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/');

    await page.getByRole('button', { name: /Guided Interview/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
