import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

// Mock ConfigStore — vi.hoisted ensures mocks are available when vi.mock factory runs
const { mockGet, mockSet, mockUpdate } = vi.hoisted(() => ({
  mockGet: vi.fn(() => ({})),
  mockSet: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@kinvolk/headlamp-plugin/lib', () => ({
  ConfigStore: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
    useConfig: vi.fn(() => () => ({})),
  })),
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue({});
  });

  it('renders all three configuration fields', () => {
    render(<SettingsPage />);
    expect(screen.getByLabelText('Prometheus namespace')).toBeInTheDocument();
    expect(screen.getByLabelText('Prometheus service name')).toBeInTheDocument();
    expect(screen.getByLabelText('Prometheus port')).toBeInTheDocument();
  });

  it('shows placeholder text with examples', () => {
    render(<SettingsPage />);
    expect(screen.getByPlaceholderText(/observability/)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/monitoring-kube-prometheus-prometheus/)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/9090/)).toBeInTheDocument();
  });

  it('loads values from ConfigStore when no data prop is provided', () => {
    mockGet.mockReturnValue({
      prometheusNamespace: 'observability',
      prometheusService: 'monitoring-kube-prometheus-prometheus',
      prometheusPort: '9090',
    });
    render(<SettingsPage />);
    expect(screen.getByLabelText('Prometheus namespace')).toHaveValue('observability');
    expect(screen.getByLabelText('Prometheus service name')).toHaveValue(
      'monitoring-kube-prometheus-prometheus'
    );
    expect(screen.getByLabelText('Prometheus port')).toHaveValue('9090');
  });

  it('loads values from data prop when provided', () => {
    render(
      <SettingsPage
        data={{
          prometheusNamespace: 'myns',
          prometheusService: 'mysvc',
          prometheusPort: '9091',
        }}
      />
    );
    expect(screen.getByLabelText('Prometheus namespace')).toHaveValue('myns');
    expect(screen.getByLabelText('Prometheus service name')).toHaveValue('mysvc');
    expect(screen.getByLabelText('Prometheus port')).toHaveValue('9091');
  });

  it('calls ConfigStore.update when namespace changes', () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Prometheus namespace');
    fireEvent.change(input, { target: { value: 'observability' } });
    expect(mockUpdate).toHaveBeenCalledWith({ prometheusNamespace: 'observability' });
  });

  it('calls ConfigStore.update when service name changes', () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Prometheus service name');
    fireEvent.change(input, { target: { value: 'my-prometheus' } });
    expect(mockUpdate).toHaveBeenCalledWith({ prometheusService: 'my-prometheus' });
  });

  it('calls ConfigStore.update when port changes', () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Prometheus port');
    fireEvent.change(input, { target: { value: '9091' } });
    expect(mockUpdate).toHaveBeenCalledWith({ prometheusPort: '9091' });
  });

  it('calls onDataChange when provided and a field changes', () => {
    const onDataChange = vi.fn();
    render(<SettingsPage onDataChange={onDataChange} />);
    const input = screen.getByLabelText('Prometheus namespace');
    fireEvent.change(input, { target: { value: 'observability' } });
    expect(onDataChange).toHaveBeenCalledWith(
      expect.objectContaining({ prometheusNamespace: 'observability' })
    );
  });

  it('does not call onDataChange when not provided', () => {
    render(<SettingsPage />);
    const input = screen.getByLabelText('Prometheus namespace');
    fireEvent.change(input, { target: { value: 'observability' } });
    // No crash, ConfigStore.update still called
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('shows blank fields when no config is stored', () => {
    mockGet.mockReturnValue({});
    render(<SettingsPage />);
    expect(screen.getByLabelText('Prometheus namespace')).toHaveValue('');
    expect(screen.getByLabelText('Prometheus service name')).toHaveValue('');
    expect(screen.getByLabelText('Prometheus port')).toHaveValue('');
  });

  it('renders informational note about fallback behavior', () => {
    render(<SettingsPage />);
    expect(screen.getByText(/falls back/i)).toBeInTheDocument();
  });
});
