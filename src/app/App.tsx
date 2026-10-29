import { useEffect, type ReactNode } from 'react';
import { createHashRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { AcceptInvitePage } from '@/features/invitations/AcceptInvitePage';
import { ResetPage, SignInPage, SignUpPage } from '@/features/auth/AuthPages';
import { HomePage } from '@/features/home/HomePage';
import { InspectionPage } from '@/features/inspections/InspectionPage';
import { InspectionsPage } from '@/features/inspections/InspectionsPage';
import { NewInspectionPage } from '@/features/inspections/NewInspectionPage';
import { ReportPage } from '@/features/inspections/ReportPage';
import { ReviewPage } from '@/features/inspections/ReviewPage';
import { RoomPage } from '@/features/inspections/RoomPage';
import { SignPage } from '@/features/inspections/SignPage';
import { OnboardingPage } from '@/features/onboarding/OnboardingPage';
import { PropertiesPage } from '@/features/properties/PropertiesPage';
import { EditPropertyPage, NewPropertyPage } from '@/features/properties/PropertyFormPage';
import { PropertyPage } from '@/features/properties/PropertyPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TenancyFormPage, TenancyPage } from '@/features/tenancies/TenancyPages';
import { ButtonLink } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { LoadingBlock } from '@/ui/Spinner';
import { ToastProvider } from '@/ui/Toast';
import { AppShell } from './AppShell';
import { SessionProvider, useSession } from './session';
import { applyTheme } from './theme';

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center">{children}</div>;
}

/** Signed out → sign in (keeping where they were going). Not onboarded → onboarding. */
function RequireAuth() {
  const s = useSession();
  const loc = useLocation();
  const next = encodeURIComponent(loc.pathname + loc.search);
  if (s.loading) return <FullScreen><LoadingBlock /></FullScreen>;
  if (!s.user) return <Navigate to={`/signin?next=${next}`} replace />;
  if (!s.profile) return <FullScreen><LoadingBlock label="Setting up your account…" /></FullScreen>;
  if (!s.profile.onboarded && loc.pathname !== '/welcome') return <Navigate to={`/welcome?next=${next}`} replace />;
  return <Outlet />;
}

function GuestOnly() {
  const s = useSession();
  if (s.loading) return <FullScreen><LoadingBlock /></FullScreen>;
  if (s.user) return <Navigate to={new URLSearchParams(location.hash.split('?')[1] ?? '').get('next') || '/'} replace />;
  return <Outlet />;
}

function ThemeSync() {
  const { profile } = useSession();
  const theme = profile?.theme;
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
  return <Outlet />;
}

function NotFound() {
  return (
    <EmptyState icon={<span className="font-display text-xl">?</span>} title="Page not found" action={<ButtonLink to="/">Go home</ButtonLink>}>
      The link may be out of date.
    </EmptyState>
  );
}

const router = createHashRouter([
  {
    element: <ThemeSync />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/signin', element: <SignInPage /> },
          { path: '/signup', element: <SignUpPage /> },
          { path: '/reset', element: <ResetPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: '/welcome', element: <OnboardingPage /> },
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/properties', element: <PropertiesPage /> },
              { path: '/properties/new', element: <NewPropertyPage /> },
              { path: '/properties/:pid', element: <PropertyPage /> },
              { path: '/properties/:pid/edit', element: <EditPropertyPage /> },
              { path: '/properties/:pid/tenancies/new', element: <TenancyFormPage /> },
              { path: '/properties/:pid/tenancies/:tid', element: <TenancyPage /> },
              { path: '/properties/:pid/tenancies/:tid/edit', element: <TenancyFormPage /> },
              { path: '/properties/:pid/inspections/new', element: <NewInspectionPage /> },
              { path: '/properties/:pid/inspections/:iid', element: <InspectionPage /> },
              { path: '/properties/:pid/inspections/:iid/rooms/:rid', element: <RoomPage /> },
              { path: '/properties/:pid/inspections/:iid/review', element: <ReviewPage /> },
              { path: '/properties/:pid/inspections/:iid/sign', element: <SignPage /> },
              { path: '/properties/:pid/inspections/:iid/report', element: <ReportPage /> },
              { path: '/inspections', element: <InspectionsPage /> },
              { path: '/invite/:token', element: <AcceptInvitePage /> },
              { path: '/settings', element: <SettingsPage /> },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </SessionProvider>
  );
}
