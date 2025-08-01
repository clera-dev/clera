import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import ConditionalLogoLink from '../ConditionalLogoLink';
import { useUserOnboardingStatus } from '@/hooks/useUserOnboardingStatus';

// Mock the hooks
jest.mock('next/navigation', () => ({
  usePathname: jest.fn()
}));

jest.mock('@/hooks/useUserOnboardingStatus', () => ({
  useUserOnboardingStatus: jest.fn()
}));

jest.mock('@/components/LogoLink', () => {
  return function MockLogoLink() {
    return <div data-testid="logo-link">Logo Link</div>;
  };
});

const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;
const mockUseUserOnboardingStatus = useUserOnboardingStatus as jest.MockedFunction<typeof useUserOnboardingStatus>;

describe('ConditionalLogoLink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show logo on public pages', () => {
    mockUsePathname.mockReturnValue('/');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: null,
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.getByTestId('logo-link')).toBeInTheDocument();
  });

  it('should hide logo on dashboard pages', () => {
    mockUsePathname.mockReturnValue('/dashboard');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on account pages', () => {
    mockUsePathname.mockReturnValue('/account');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on chat pages', () => {
    mockUsePathname.mockReturnValue('/chat');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on invest pages', () => {
    mockUsePathname.mockReturnValue('/invest');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on portfolio pages', () => {
    mockUsePathname.mockReturnValue('/portfolio');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on news pages', () => {
    mockUsePathname.mockReturnValue('/news');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on info pages', () => {
    mockUsePathname.mockReturnValue('/info');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on settings pages', () => {
    mockUsePathname.mockReturnValue('/settings');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should hide logo on protected pages by default', () => {
    mockUsePathname.mockReturnValue('/protected');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should show logo on protected pages for pending_closure status', () => {
    mockUsePathname.mockReturnValue('/protected');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'pending_closure',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.getByTestId('logo-link')).toBeInTheDocument();
  });

  it('should show logo on protected pages for closed status', () => {
    mockUsePathname.mockReturnValue('/protected');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'closed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.getByTestId('logo-link')).toBeInTheDocument();
  });

  it('should not render anything while loading', () => {
    mockUsePathname.mockReturnValue('/');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: null,
      isLoading: true,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });

  it('should handle nested protected routes', () => {
    mockUsePathname.mockReturnValue('/protected/dashboard');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'pending_closure',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.getByTestId('logo-link')).toBeInTheDocument();
  });

  it('should handle nested dashboard routes', () => {
    mockUsePathname.mockReturnValue('/dashboard/analytics');
    mockUseUserOnboardingStatus.mockReturnValue({
      status: 'completed',
      isLoading: false,
      error: null
    });

    render(<ConditionalLogoLink />);
    
    expect(screen.queryByTestId('logo-link')).not.toBeInTheDocument();
  });
}); 