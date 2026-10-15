import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: { uri: string; mediaType: string; fileName?: string };
  synced: boolean;
}

export interface ChatThread {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
}

interface ChatState {
  threads: ChatThread[];
  currentThreadId: string | null;
  lastSyncedAt: number | null;

  // Thread actions
  createThread: () => string;
  deleteThread: (threadId: string) => void;

  // Message actions
  addMessage: (msg: Omit<ChatMessage, 'synced'>) => void;
  updateMessage: (
    id: string,
    updates: Partial<Pick<ChatMessage, 'content' | 'attachment'>>,
  ) => void;
  setMessages: (msgs: Omit<ChatMessage, 'synced'>[]) => void;

  // Sync helpers
  getUnsyncedMessages: () => ChatMessage[];
  markAsSynced: (ids: string[]) => void;
  syncToServer: () => Promise<void>;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threads: [],
      currentThreadId: null,
      lastSyncedAt: null,

      createThread: () => {
        const id = generateId();
        const thread: ChatThread = { id, messages: [], createdAt: Date.now() };
        set(state => ({
          threads: [thread, ...state.threads],
          currentThreadId: id,
        }));
        return id;
      },

      deleteThread: (threadId) => {
        set(state => ({
          threads: state.threads.filter(t => t.id !== threadId),
          currentThreadId:
            state.currentThreadId === threadId ? null : state.currentThreadId,
        }));
      },

      addMessage: (msg) => {
        const { currentThreadId } = get();
        if (!currentThreadId) return;

        const message: ChatMessage = { ...msg, synced: false };
        set(state => ({
          threads: state.threads.map(t =>
            t.id === currentThreadId
              ? { ...t, messages: [...t.messages, message] }
              : t
          ),
        }));
      },

      updateMessage: (id, updates) => {
        const { currentThreadId } = get();
        if (!currentThreadId) return;

        set(state => ({
          threads: state.threads.map(t =>
            t.id === currentThreadId
              ? {
                  ...t,
                  messages: t.messages.map(m =>
                    m.id === id ? { ...m, ...updates } : m
                  ),
                }
              : t
          ),
        }));
      },

      setMessages: (msgs) => {
        const { currentThreadId } = get();
        if (!currentThreadId) return;

        const messages: ChatMessage[] = msgs.map(m => ({ ...m, synced: false }));
        set(state => ({
          threads: state.threads.map(t =>
            t.id === currentThreadId ? { ...t, messages } : t
          ),
        }));
      },

      getUnsyncedMessages: () => {
        const { threads, currentThreadId } = get();
        const thread = threads.find(t => t.id === currentThreadId);
        return thread?.messages.filter(m => !m.synced) ?? [];
      },

      markAsSynced: (ids) => {
        const { currentThreadId } = get();
        if (!currentThreadId) return;

        const idSet = new Set(ids);
        set(state => ({
          lastSyncedAt: Date.now(),
          threads: state.threads.map(t =>
            t.id === currentThreadId
              ? {
                  ...t,
                  messages: t.messages.map(m =>
                    idSet.has(m.id) ? { ...m, synced: true } : m
                  ),
                }
              : t
          ),
        }));
      },

      syncToServer: async () => {
        // Placeholder — will integrate with server sync endpoint
        const unsynced = get().getUnsyncedMessages();
        if (unsynced.length === 0) return;

        // TODO: POST unsynced messages to server
        // On success:
        get().markAsSynced(unsynced.map(m => m.id));
      },
    }),
    {
      name: 'chat-storage',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        threads: state.threads,
        currentThreadId: state.currentThreadId,
        lastSyncedAt: state.lastSyncedAt,
      }),
      migrate: () => ({
        threads: [],
        currentThreadId: null,
        lastSyncedAt: null,
      }),
    }
  )
);
