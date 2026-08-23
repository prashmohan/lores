import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe } from 'vitest-axe';
import { DataBackupModal } from '../src/components/workspace/DataBackupModal';
import { api, ApiError } from '../src/lib/api';
import type { ImportSummaryRead } from '../src/types/api';

const mockImportSummary: ImportSummaryRead = {
  success: true,
  filename: 'my-family-tree.ged',
  format: 'gedcom',
  people_created: 15,
  people_merged: 2,
  unions_created: 6,
  children_linked: 11,
  lore_notes_created: 3,
  warnings: ['Skipped unsupported custom tag _CUSTOM_TAG'],
};

describe('DataBackupModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('renders Export and Import tabs with workspace name', () => {
    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    expect(screen.getByText(/Data & Backup/i)).toBeInTheDocument();
    expect(screen.getByText(/The Vance Family/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Export/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Import/i })).toBeInTheDocument();

    // Export tab content should be visible by default
    expect(screen.getByText(/GEDCOM 7.0 \/ 5.5.1/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Universal genealogy format compatible with GrampsWeb, Gramps, Ancestry, and FamilySearch./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Lores JSON Archive/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Complete lossless archive including people, unions, rich lore stories, tags, and workspace metadata./i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download GEDCOM/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download JSON/i })).toBeInTheDocument();
  });

  it('allows tab switching between Export and Import', () => {
    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    const importTab = screen.getByRole('tab', { name: /Import/i });
    fireEvent.click(importTab);

    expect(screen.getByText(/Upload & Import Tree/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop a GEDCOM \(\.ged\) or Lores Archive \(\.json\)/i)).toBeInTheDocument();

    const exportTab = screen.getByRole('tab', { name: /Export/i });
    fireEvent.click(exportTab);

    expect(screen.getByText(/Universal genealogy format compatible with GrampsWeb/i)).toBeInTheDocument();
  });

  it('exports GEDCOM file when Download GEDCOM is clicked', async () => {
    const mockBlob = new Blob(['0 HEAD\n1 SOUR Lores\n0 TRLR'], { type: 'text/plain' });
    const exportGedcomSpy = vi.spyOn(api.dataExchange, 'exportGedcom').mockResolvedValue(mockBlob);

    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    const downloadGedcomBtn = screen.getByRole('button', { name: /Download GEDCOM/i });
    fireEvent.click(downloadGedcomBtn);

    await waitFor(() => {
      expect(exportGedcomSpy).toHaveBeenCalledWith('ws-123');
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });
  });

  it('exports JSON archive when Download JSON is clicked', async () => {
    const mockBlob = new Blob([JSON.stringify({ schema_version: '1.0' })], { type: 'application/json' });
    const exportJsonSpy = vi.spyOn(api.dataExchange, 'exportJson').mockResolvedValue(mockBlob);

    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    const downloadJsonBtn = screen.getByRole('button', { name: /Download JSON/i });
    fireEvent.click(downloadJsonBtn);

    await waitFor(() => {
      expect(exportJsonSpy).toHaveBeenCalledWith('ws-123');
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });
  });

  it('displays error message if export fails', async () => {
    vi.spyOn(api.dataExchange, 'exportGedcom').mockRejectedValue(new ApiError(500, 'Server failed to generate GEDCOM'));

    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    const downloadGedcomBtn = screen.getByRole('button', { name: /Download GEDCOM/i });
    fireEvent.click(downloadGedcomBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server failed to generate GEDCOM');
    });
  });

  it('allows selecting a GEDCOM file, importing it, and shows summary report', async () => {
    const importGedcomSpy = vi.spyOn(api.dataExchange, 'importGedcom').mockResolvedValue(mockImportSummary);
    const onImportSuccess = vi.fn();

    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
        onImportSuccess={onImportSuccess}
      />
    );

    // Switch to Import tab
    fireEvent.click(screen.getByRole('tab', { name: /Import/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(['0 HEAD\n0 TRLR'], 'my-family-tree.ged', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // File feedback
    expect(screen.getByText('my-family-tree.ged')).toBeInTheDocument();

    // Click Import
    const importBtn = screen.getByRole('button', { name: /Upload & Import Tree/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(importGedcomSpy).toHaveBeenCalledWith('ws-123', file);
      expect(onImportSuccess).toHaveBeenCalled();
    });

    // Summary report should be displayed
    await waitFor(() => {
      expect(screen.getByText(/Import Completed Successfully/i)).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument(); // People Created
      expect(screen.getByText('2')).toBeInTheDocument();  // People Merged
      expect(screen.getByText('6')).toBeInTheDocument();  // Unions Created
      expect(screen.getByText('11')).toBeInTheDocument(); // Children Linked
      expect(screen.getByText('3')).toBeInTheDocument();  // Lore Stories Added
      expect(screen.getByText(/Skipped unsupported custom tag _CUSTOM_TAG/i)).toBeInTheDocument();
    });
  });

  it('imports JSON archive when a .json file is selected', async () => {
    const importJsonSpy = vi.spyOn(api.dataExchange, 'importJson').mockResolvedValue({
      ...mockImportSummary,
      format: 'json',
      filename: 'backup.json',
      warnings: [],
    });
    const onImportSuccess = vi.fn();

    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
        onImportSuccess={onImportSuccess}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Import/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify({ schema_version: '1.0' })], 'backup.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const importBtn = screen.getByRole('button', { name: /Upload & Import Tree/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(importJsonSpy).toHaveBeenCalledWith('ws-123', file);
      expect(onImportSuccess).toHaveBeenCalled();
    });
  });

  it('handles import errors gracefully', async () => {
    vi.spyOn(api.dataExchange, 'importGedcom').mockRejectedValue(new ApiError(400, 'Invalid GEDCOM format'));

    render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: /Import/i }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['corrupted content'], 'corrupted.ged', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const importBtn = screen.getByRole('button', { name: /Upload & Import Tree/i });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid GEDCOM format');
    });
  });

  it('passes axe accessibility audit in export and import states', async () => {
    const { container } = render(
      <DataBackupModal
        isOpen={true}
        onClose={vi.fn()}
        workspaceId="ws-123"
        workspaceName="The Vance Family"
      />
    );

    const exportResults = await axe(container);
    expect(exportResults).toHaveNoViolations();

    // Switch to import tab
    fireEvent.click(screen.getByRole('tab', { name: /Import/i }));

    const importResults = await axe(container);
    expect(importResults).toHaveNoViolations();
  });
});
