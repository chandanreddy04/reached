/**
 * The app's shared memory.
 *
 * Several screens need the same information (the current check-in and the
 * list of trusted contacts). Instead of each screen keeping its own copy, we
 * keep it here in one place and let any screen read or change it.
 *
 * This uses React "Context": the <SafetyProvider> wraps the whole app (see
 * src/app/_layout.tsx), and any screen can call useSafety() to get the data.
 *
 * Where data lives:
 * - On the server (Supabase): the real copy. The server keeps watching your
 *   check-in even if your phone dies.
 * - On the phone (AsyncStorage): a copy, so the app opens instantly and the
 *   countdown keeps working with no signal.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { scheduleCheckInNotifications, setUpNotifications } from '@/services/notifications';
import {
  deleteContact,
  ensureSignedIn,
  fetchCheckInStatus,
  fetchContacts,
  fetchProfileName,
  insertContact,
  markCheckInSafe,
  saveProfileName,
  sendSos as sendSosOnServer,
  startOrUpdateCheckIn,
  type EndCheckInResult,
  type ServerCheckIn,
  type SosResult,
} from '@/services/server';

// One person in your Circle of Trust.
export type Contact = {
  id: string;
  name: string;
  phone: string;
};

// An active check-in: when it started and when you expect to be back.
export type CheckIn = {
  startedAt: Date;
  returnBy: Date;
  // The server's copy of this check-in, or null if the server never got it.
  // alertsSentAt / alertsSummary say whether your Circle was texted.
  server: ({ id: string } & Partial<ServerCheckIn> & Pick<ServerCheckIn, 'status'>) | null;
};

// Everything a screen can read or do via useSafety().
// Functions that talk to the server return true if the server got it.
type SafetyStore = {
  serverConnected: boolean;

  // Your name, used in texts to your Circle ("Alex hasn't checked in").
  profileName: string;
  setProfileName: (name: string) => Promise<boolean>;

  checkIn: CheckIn | null;
  startCheckIn: (returnBy: Date) => Promise<boolean>;
  // Says whether the server got it in time, or your Circle was already alerted.
  endCheckIn: () => Promise<EndCheckInResult>;

  contacts: Contact[];
  addContact: (name: string, phone: string) => Promise<boolean>;
  removeContact: (id: string) => Promise<boolean>;

  sendSos: (
    location: { latitude: number; longitude: number; accuracyMeters: number | null } | null,
  ) => Promise<SosResult>;
};

const SafetyContext = createContext<SafetyStore | null>(null);

// The names the data is saved under on the phone.
const CONTACTS_KEY = 'reached:contacts';
const CHECK_IN_KEY = 'reached:check-in';
const NAME_KEY = 'reached:name';

// How often to ask the server about the active check-in.
const STATUS_POLL_MS = 30 * 1000;

// ----- Loading from the phone -----
// AsyncStorage only stores text, so we turn data into JSON text when saving
// and back into objects (and Dates) when loading.

async function loadContacts(): Promise<Contact[]> {
  const text = await AsyncStorage.getItem(CONTACTS_KEY);
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [];
}

async function loadCheckIn(): Promise<CheckIn | null> {
  const text = await AsyncStorage.getItem(CHECK_IN_KEY);
  if (!text) return null;
  const parsed = JSON.parse(text);
  // Dates were saved as text like "2026-10-16T21:30:00.000Z"; turn them back into Dates.
  const checkIn: CheckIn = {
    startedAt: new Date(parsed.startedAt),
    returnBy: new Date(parsed.returnBy),
    server: parsed.server ?? null,
  };
  return isNaN(checkIn.returnBy.getTime()) ? null : checkIn;
}

export function SafetyProvider({ children }: { children: ReactNode }) {
  // useState holds a value and re-draws the screen whenever it changes.
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  // False until the saved data has been read from the phone.
  const [loaded, setLoaded] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [profileName, setProfileNameState] = useState('');

  // 1) When the app opens: read the phone's copy (fast), then sync with the server.
  useEffect(() => {
    async function load() {
      setUpNotifications().catch((error) => console.warn('Could not set up notifications', error));

      let localContacts: Contact[] = [];
      let localCheckIn: CheckIn | null = null;
      try {
        let localName: string | null;
        [localContacts, localCheckIn, localName] = await Promise.all([
          loadContacts(),
          loadCheckIn(),
          AsyncStorage.getItem(NAME_KEY),
        ]);
        setContacts(localContacts);
        setCheckIn(localCheckIn);
        setProfileNameState(localName ?? '');
      } catch (error) {
        // Saved data was unreadable: start fresh rather than crash.
        console.warn('Could not load saved data', error);
      } finally {
        setLoaded(true);
      }

      await syncWithServer(localContacts, localCheckIn);
    }

    async function syncWithServer(localContacts: Contact[], localCheckIn: CheckIn | null) {
      if (!(await ensureSignedIn())) return;

      // Contacts: the server's list is the real one. The very first time,
      // upload contacts that were added before the app had a server.
      let serverContacts = await fetchContacts();
      if (serverContacts === null) return;
      if (serverContacts.length === 0 && localContacts.length > 0) {
        for (const c of localContacts) await insertContact(c.name, c.phone);
        serverContacts = (await fetchContacts()) ?? serverContacts;
      }
      setContacts(serverContacts);

      // Your name: use the server's copy if it has one.
      const serverName = await fetchProfileName();
      if (serverName) {
        setProfileNameState(serverName);
        AsyncStorage.setItem(NAME_KEY, serverName).catch(() => {});
      }

      // Check-in: if the server never got the current one, send it now.
      if (localCheckIn && !localCheckIn.server && localCheckIn.returnBy.getTime() > Date.now()) {
        const id = await startOrUpdateCheckIn(localCheckIn.returnBy);
        if (id) setCheckIn({ ...localCheckIn, server: { id, status: 'active' } });
      }

      setServerConnected(true);
    }

    load();
  }, []);

  // 2) Whenever contacts change (after loading), save the phone's copy.
  useEffect(() => {
    if (!loaded) return; // don't overwrite saved data with the empty starting list
    AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts)).catch((error) =>
      console.warn('Could not save contacts', error),
    );
  }, [contacts, loaded]);

  // 3) Whenever the check-in changes (after loading), save the phone's copy, or
  //    delete it when it ends. Also reschedule (or cancel) the reminders.
  const returnByTime = checkIn?.returnBy.getTime() ?? null;
  useEffect(() => {
    if (!loaded) return;
    const saving = checkIn
      ? AsyncStorage.setItem(CHECK_IN_KEY, JSON.stringify(checkIn))
      : AsyncStorage.removeItem(CHECK_IN_KEY);
    saving.catch((error) => console.warn('Could not save check-in', error));
  }, [checkIn, loaded]);

  useEffect(() => {
    if (!loaded) return;
    // Only depends on the return time, so a server status update doesn't
    // needlessly cancel and re-create the notifications.
    scheduleCheckInNotifications(returnByTime === null ? null : new Date(returnByTime)).catch(
      (error) => console.warn('Could not schedule notifications', error),
    );
  }, [returnByTime, loaded]);

  // 4) While a check-in is on the server, ask it every 30 seconds (and whenever
  //    the app comes back to the front) whether it has marked it missed.
  const serverId = checkIn?.server?.id ?? null;
  useEffect(() => {
    if (!serverId) return;

    async function refresh() {
      const latest = await fetchCheckInStatus(serverId!);
      if (!latest) return; // couldn't reach the server; try again next time
      setCheckIn((current) =>
        current?.server?.id === serverId
          ? { ...current, server: { id: serverId!, ...latest } }
          : current,
      );
    }

    refresh();
    const timer = setInterval(refresh, STATUS_POLL_MS);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [serverId]);

  const store: SafetyStore = {
    serverConnected,

    profileName,
    setProfileName: async (name) => {
      const trimmed = name.trim();
      if (!(await saveProfileName(trimmed))) return false;
      setProfileNameState(trimmed);
      AsyncStorage.setItem(NAME_KEY, trimmed).catch(() => {});
      return true;
    },

    checkIn,
    startCheckIn: async (returnBy) => {
      const id = await startOrUpdateCheckIn(returnBy);
      setCheckIn((current) => ({
        startedAt: current?.startedAt ?? new Date(),
        returnBy,
        server: id ? { id, status: 'active' } : null,
      }));
      return id !== null;
    },
    endCheckIn: async () => {
      const id = checkIn?.server?.id;
      const result: EndCheckInResult = id ? await markCheckInSafe(id) : { reached: false };
      setCheckIn(null); // always end it on the phone
      return result;
    },

    contacts,
    addContact: async (name, phone) => {
      const saved = await insertContact(name.trim(), phone.trim());
      if (!saved) return false;
      setContacts((current) => [...current, saved]);
      return true;
    },
    removeContact: async (id) => {
      if (!(await deleteContact(id))) return false;
      setContacts((current) => current.filter((c) => c.id !== id));
      return true;
    },

    sendSos: (location) => sendSosOnServer(location),
  };

  // Show nothing until the saved data is loaded. The splash screen stays up
  // meanwhile, so you never briefly see an empty Circle.
  if (!loaded) return null;

  return <SafetyContext.Provider value={store}>{children}</SafetyContext.Provider>;
}

// Screens call this to get the shared data, e.g. const { contacts } = useSafety();
export function useSafety() {
  const store = useContext(SafetyContext);
  if (!store) {
    throw new Error('useSafety must be used inside <SafetyProvider>');
  }
  return store;
}
