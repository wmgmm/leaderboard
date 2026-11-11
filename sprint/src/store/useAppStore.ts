import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deliver, getBoard, getMyVotes, waitingVotes } from '../../../shared/client';
import type { Board, ReactionKind } from '../../../shared/types';
import { type UseCase, useCases } from '../data/useCases';
import { shuffle } from '../lib/shuffle';
import { SPRINT_DURATION_SECONDS, SPRINT_CARDS } from '../lib/constants';
import { SESSION_CODE } from '../lib/session';

export type View = 'landing' | 'share' | 'sprint' | 'results';

// Matt, 11 Nov 2026: "Tell us how you use AI" is the last card of every sprint. It comes
// up when the deck or the clock runs out, and leads on to the results.

interface AppState {
  // Navigation
  view: View;
  setView: (v: View) => void;

  // Sprint state
  shuffledCases: UseCase[];
  currentCardIndex: number;
  timerSeconds: number;
  isTimerRunning: boolean;
  timed: boolean; // false when they chose to go through the cards with no clock

  // Votes. "Liked" means a happy face; savedCases is the liked list, kept as full
  // cards because the results screen and the PDF read it.
  votes: Record<string, ReactionKind>;
  savedCases: UseCase[];
  hasSprinted: boolean; // they have started a sprint in this browser before
  cleared: string[]; // prompts whose vote they chose to forget here; hidden until voted on again
  shareFromHome: boolean; // the share screen was opened from the first screen, not mid-sprint
  justShared: boolean; // they shared from the first screen a moment ago: say thank you there
  openShare: () => void;
  closeShare: (shared: boolean) => void;

  // Votes this browser cast on the try-it page count here too
  syncVotes: () => void;

  // The room's live chart, for the tags on cards
  board: Board | null;
  refreshBoard: () => void;

  // Sprint actions
  initSprint: (timed?: boolean) => void;
  vote: (kind: ReactionKind) => void;
  finishSprint: (shared?: boolean) => void;
  sharedInSprint: boolean; // they answered the last card of this sprint: the results screen says thank you
  tickTimer: () => void;
  clearPicks: () => void;

  // Shared
  showCtaModal: boolean;
  setShowCtaModal: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'landing',
      setView: (v) => set({ view: v }),

      shuffledCases: [],
      currentCardIndex: 0,
      timerSeconds: SPRINT_DURATION_SECONDS,
      isTimerRunning: false,
      timed: true,

      votes: {},
      savedCases: [],
      cleared: [],
      hasSprinted: false,
      shareFromHome: false,
      justShared: false,
      // "Share a useful prompt" on the first screen: the same form, with no sprint running.
      openShare: () => set({ view: 'share', shareFromHome: true, justShared: false }),
      closeShare: (shared) => set({ view: 'landing', shareFromHome: false, justShared: shared }),

      // The server's record of this browser's votes is the truth (a vote may have been cast,
      // changed or taken back on the try-it page), plus anything still waiting to be sent.
      syncVotes: () => {
        getMyVotes(SESSION_CODE).then(mine => {
          // A slow reply that lands after they have started voting is older than what this
          // browser now knows: using it would wipe the votes just cast from the screen.
          if (get().view !== 'landing') return;
          const votes: Record<string, ReactionKind> = { ...mine };
          const waiting = waitingVotes(SESSION_CODE);
          for (const id of Object.keys(waiting)) {
            const kind = waiting[id];
            if (kind) votes[id] = kind; else delete votes[id];
          }
          for (const id of get().cleared) delete votes[id]; // they asked to forget these here
          set({ votes, savedCases: useCases.filter(c => votes[c.id] === 'happy') });
        }).catch(() => { /* server away: carry on with what this browser remembers */ });
      },

      board: null,
      refreshBoard: () => {
        getBoard(SESSION_CODE).then(board => set({ board })).catch(() => { /* tags are a nicety */ });
      },

      initSprint: (timed = true) => {
        // A sprint is a random handful, not the whole set. It is drawn from the prompts this
        // person has not voted on, so coming back brings new ones. Only when they have voted
        // on everything does it draw from the ones they have seen, to change their mind.
        const voted = get().votes;
        const fresh = useCases.filter(c => !voted[c.id]);
        const pool = fresh.length > 0 ? fresh : useCases;
        set({
          shuffledCases: shuffle(pool).slice(0, SPRINT_CARDS),
          currentCardIndex: 0,
          timerSeconds: SPRINT_DURATION_SECONDS,
          timed,
          isTimerRunning: timed,
          shareFromHome: false,
          justShared: false,
          hasSprinted: true,
          sharedInSprint: false,
          view: 'sprint',
        });
      },

      vote: (kind) => {
        const { shuffledCases, currentCardIndex, savedCases, votes, view, cleared } = get();
        const card = shuffledCases[currentCardIndex];
        if (!card || view !== 'sprint') return; // the clock may have run out while the card was leaving
        const liked = savedCases.filter(s => s.id !== card.id);
        if (kind === 'happy') liked.push(card);
        const next = currentCardIndex + 1;
        const done = next >= shuffledCases.length;
        // Sent (or saved to send later) before anything else, so nothing that goes wrong
        // below can cost the vote. The sprint never waits for the network, and never mentions it.
        deliver({ t: 'vote', code: SESSION_CODE, id: card.id, kind });
        set({
          votes: { ...votes, [card.id]: kind },
          savedCases: liked,
          cleared: cleared.filter(id => id !== card.id),
          currentCardIndex: next,
          // After the last card comes the one where they give rather than vote.
          ...(done ? { isTimerRunning: false, view: 'share' as View } : {}),
        });
      },

      // On to the results after that last card, whether they submitted or not.
      finishSprint: (shared = false) => set({ view: 'results', sharedInSprint: shared }),
      sharedInSprint: false,

      tickTimer: () => {
        const { timerSeconds } = get();
        if (timerSeconds <= 1) {
          set({ timerSeconds: 0, isTimerRunning: false, view: 'share' });
        } else {
          set({ timerSeconds: timerSeconds - 1 });
        }
      },

      // Forgets this browser's picks, and keeps them forgotten. Votes already counted on the
      // chart stay counted; voting on a prompt again brings it back here.
      clearPicks: () => set({ savedCases: [], votes: {}, cleared: Object.keys(get().votes) }),

      showCtaModal: false,
      setShowCtaModal: (v) => set({ showCtaModal: v }),
    }),
    {
      // Not the original sprint's key: browser storage is shared across wmgmm.github.io,
      // so reusing 'ai-discovery-toolkit' would overwrite people's saved prompts there.
      name: 'totp-sprint',
      version: 1,
      partialize: (state) => ({
        savedCases: state.savedCases, votes: state.votes, cleared: state.cleared, hasSprinted: state.hasSprinted,
      }),
    }
  )
);
