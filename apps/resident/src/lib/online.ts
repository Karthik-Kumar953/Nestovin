import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

/** TanStack Query pauses requests while offline and refetches on reconnect. Call once at startup. */
export function wireOnlineManager() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) =>
      setOnline(s.isConnected !== false && s.isInternetReachable !== false),
    ),
  );
}

/** False only when the device reports no connection (unknown counts as online). */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((s) =>
        setOnline(s.isConnected !== false && s.isInternetReachable !== false),
      ),
    [],
  );
  return online;
}
