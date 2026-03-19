import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { SuggestedEditsPanel } from '../SuggestedEditsPanel';

describe('SuggestedEditsPanel', () => {
  const mockProps = {
    status: 'Ready',
    isPaused: false,
    localSuggestions: [],
    globalSuggestion: null,
    onRefreshContext: jest.fn(),
    onRefreshFull: jest.fn(),
    onPauseToggle: jest.fn(),
    onApply: jest.fn(),
    onDismiss: jest.fn(),
    onOpenSettings: jest.fn(),
    hasApiKey: true
  };

  it('should render the status message', () => {
    const { getByText } = render(<SuggestedEditsPanel {...mockProps} />);
    expect(getByText('Ready')).toBeDefined();
  });

  it('should call onRefreshContext when refresh button is clicked', () => {
    const { getByText } = render(<SuggestedEditsPanel {...mockProps} />);
    fireEvent.click(getByText('Refresh (context)'));
    expect(mockProps.onRefreshContext).toHaveBeenCalled();
  });

  it('should show "Resume" when paused', () => {
    const { getByText } = render(
      <SuggestedEditsPanel {...mockProps} isPaused={true} />
    );
    expect(getByText('Resume')).toBeDefined();
  });
});
