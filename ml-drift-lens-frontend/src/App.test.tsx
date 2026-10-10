import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App shell', () => {
  it('renders the professional application header and navigation labels', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getAllByText(/NID ModelWatch/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Cybersecurity Threat Detection/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /overview/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /predictions/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /history/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /system status/i })).toBeTruthy();
  });
});
