import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  user: any | null;
  lastKnownEmail: string | null;
  lastKnownContact: string | null;
  _hasHydrated: boolean;
  setToken: (token: string) => void;
  setUser: (user: any) => void;
  setLastKnownEmail: (email: string | null) => void;
  setLastKnownContact: (contact: string | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      lastKnownEmail: null,
      lastKnownContact: null,
      _hasHydrated: false,
      isAuthenticated: false,
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      setUser: (user) => set({ user }),
      setLastKnownEmail: (email) => set({ lastKnownEmail: email }),
      setLastKnownContact: (contact) => set({ lastKnownContact: contact }),
      logout: () => {
        AsyncStorage.removeItem('flahy_ai_consent_accepted');
        set({
          token: null,
          user: null,
          lastKnownEmail: null,
          lastKnownContact: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ _hasHydrated: true });
      },
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        lastKnownEmail: state.lastKnownEmail,
        lastKnownContact: state.lastKnownContact,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
