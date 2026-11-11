// Closing the workout's screens when it ends elsewhere than on them, as when the watch finishes it.
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

/** Closes the workout's screens, if the app is on them when it is called. */
export function useCloseSessionScreens() {
  const pathname = usePathname();
  // Where the app is when it is called, which may be later than this render.
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  return () => {
    if (path.current.startsWith('/session')) router.dismissAll();
  };
}
