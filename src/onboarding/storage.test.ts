import { Storage } from 'expo-sqlite/kv-store';

import {
  clearDraft,
  forgetOtherUsers,
  loadCompleted,
  loadDraft,
  saveCompleted,
  saveDraft,
} from './storage';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      items,
      getItemSync: jest.fn((key: string) => items.get(key) ?? null),
      setItemSync: jest.fn((key: string, value: string) => {
        items.set(key, value);
      }),
      removeItemSync: jest.fn((key: string) => items.delete(key)),
      getAllKeysSync: jest.fn(() => [...items.keys()]),
    },
  };
});

const items = (Storage as unknown as { items: Map<string, string> }).items;

describe('onboarding storage', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    items.clear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('drafts', () => {
    it('loads the draft it saved', () => {
      const draft = { step: 'weight', answers: { goal: 'lose_fat', heightCm: 180 } } as const;
      saveDraft('user-1', draft);
      expect(loadDraft('user-1')).toEqual(draft);
    });

    it('keeps the drafts of different users apart', () => {
      saveDraft('user-1', { step: 'weight', answers: { goal: 'lose_fat' } });
      saveDraft('user-2', { step: 'goal', answers: {} });
      expect(loadDraft('user-1')?.step).toBe('weight');
      expect(loadDraft('user-2')?.step).toBe('goal');
      expect(loadDraft('user-3')).toBeNull();
    });

    it('has no draft once it is cleared', () => {
      saveDraft('user-1', { step: 'weight', answers: {} });
      clearDraft('user-1');
      expect(loadDraft('user-1')).toBeNull();
      expect(items.size).toBe(0);
    });

    it('discards a draft of another version', () => {
      items.set(
        'onboarding.user-1.draft',
        JSON.stringify({ version: 2, step: 'weight', answers: {} }),
      );
      expect(loadDraft('user-1')).toBeNull();
      items.set('onboarding.user-1.draft', JSON.stringify({ step: 'weight', answers: {} }));
      expect(loadDraft('user-1')).toBeNull();
    });

    it('discards a draft whose step no longer exists', () => {
      items.set(
        'onboarding.user-1.draft',
        JSON.stringify({ version: 1, step: 'old-step', answers: {} }),
      );
      expect(loadDraft('user-1')).toBeNull();
      items.set('onboarding.user-1.draft', JSON.stringify({ version: 1, answers: {} }));
      expect(loadDraft('user-1')).toBeNull();
    });

    it('treats a draft without answers as empty answers', () => {
      items.set('onboarding.user-1.draft', JSON.stringify({ version: 1, step: 'goal' }));
      expect(loadDraft('user-1')).toEqual({ step: 'goal', answers: {} });
    });

    it('discards a damaged draft', () => {
      items.set('onboarding.user-1.draft', '{"version":1,"step":');
      expect(loadDraft('user-1')).toBeNull();
    });
  });

  describe('completion', () => {
    it('is not completed until saved as completed', () => {
      expect(loadCompleted('user-1')).toBe(false);
      saveCompleted('user-1', true);
      expect(loadCompleted('user-1')).toBe(true);
      expect(loadCompleted('user-2')).toBe(false);
    });

    it('removes the flag when saved as not completed', () => {
      saveCompleted('user-1', true);
      saveCompleted('user-1', false);
      expect(loadCompleted('user-1')).toBe(false);
      expect(items.size).toBe(0);
    });

    it('only counts the stored value true as completed', () => {
      items.set('onboarding.user-1.completed', 'yes');
      expect(loadCompleted('user-1')).toBe(false);
    });
  });

  describe('forgetOtherUsers', () => {
    it("removes only other users' onboarding data", () => {
      saveDraft('user-1', { step: 'weight', answers: {} });
      saveCompleted('user-1', true);
      saveDraft('user-2', { step: 'goal', answers: {} });
      saveCompleted('user-2', true);
      // A user whose id starts with the current one's must not be mistaken for it.
      saveDraft('user-10', { step: 'goal', answers: {} });
      items.set('settings.theme', 'dark');

      forgetOtherUsers('user-1');

      expect([...items.keys()].sort()).toEqual([
        'onboarding.user-1.completed',
        'onboarding.user-1.draft',
        'settings.theme',
      ]);
    });
  });

  describe('storage errors', () => {
    const failure = new Error('disk I/O error');

    it('treats a failed read as nothing stored', () => {
      jest.mocked(Storage.getItemSync).mockImplementationOnce(() => {
        throw failure;
      });
      expect(loadDraft('user-1')).toBeNull();
      jest.mocked(Storage.getItemSync).mockImplementationOnce(() => {
        throw failure;
      });
      expect(loadCompleted('user-1')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith('Could not read onboarding.user-1.draft', failure);
    });

    it('ignores a failed write', () => {
      jest.mocked(Storage.setItemSync).mockImplementationOnce(() => {
        throw failure;
      });
      expect(() => saveDraft('user-1', { step: 'goal', answers: {} })).not.toThrow();
      jest.mocked(Storage.removeItemSync).mockImplementationOnce(() => {
        throw failure;
      });
      expect(() => clearDraft('user-1')).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith('Could not write onboarding.user-1.draft', failure);
    });

    it('ignores a failure while forgetting other users', () => {
      jest.mocked(Storage.getAllKeysSync).mockImplementationOnce(() => {
        throw failure;
      });
      expect(() => forgetOtherUsers('user-1')).not.toThrow();
      expect(warn).toHaveBeenCalledWith(
        'Could not remove the onboarding data of other users',
        failure,
      );
    });
  });
});
