import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Tournament, TournamentConfig, Player, TournamentStatus, SeatAssignment } from "@/lib/types";
import { DEFAULT_BLIND_STRUCTURE, DEFAULT_CONFIG } from "@/lib/constants";
import { generateId } from "@/lib/tournament-utils";
import { getPayoutPercentages } from "@/lib/prize-calculator";

interface TournamentState {
  tournaments: Record<string, Tournament>;

  // Tournament CRUD
  createTournament: (name: string, date: string) => string;
  deleteTournament: (id: string) => void;
  updateConfig: (id: string, config: Partial<TournamentConfig>) => void;

  // Player management
  addPlayer: (tournamentId: string, name: string) => void;
  removePlayer: (tournamentId: string, playerId: string) => void;

  // Tournament flow
  startTournament: (id: string) => void;
  pauseTournament: (id: string) => void;
  resumeTournament: (id: string) => void;
  finishTournament: (id: string) => void;
  resetTournament: (id: string) => void;

  // Timer
  tick: (id: string) => void;
  nextLevel: (id: string) => void;
  prevLevel: (id: string) => void;
  resetLevelTimer: (id: string) => void;

  // Player actions
  knockoutPlayer: (tournamentId: string, playerId: string, knockedOutByPlayerId: string) => void;
  undoKnockout: (tournamentId: string) => void;
  registerRebuy: (tournamentId: string, playerId: string) => void;
  registerAddon: (tournamentId: string, playerId: string) => void;

  // Duplication
  duplicateTournament: (sourceId: string) => string | null;

  // Seating
  drawSeats: (tournamentId: string) => void;
  clearSeats: (tournamentId: string) => void;
}

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      tournaments: {},

      createTournament: (name: string, date: string) => {
        const id = generateId();
        const config: TournamentConfig = {
          id,
          name,
          date,
          ...DEFAULT_CONFIG,
          blindStructure: [...DEFAULT_BLIND_STRUCTURE],
          payoutPercentages: [],
          currency: DEFAULT_CONFIG.currency,
        };

        const tournament: Tournament = {
          config,
          players: [],
          timer: {
            currentLevelIndex: 0,
            secondsRemaining: DEFAULT_BLIND_STRUCTURE[0].duration,
            isRunning: false,
          },
          status: "setup",
          knockoutOrder: [],
        };

        set((state) => ({
          tournaments: { ...state.tournaments, [id]: tournament },
        }));
        return id;
      },

      deleteTournament: (id: string) => {
        set((state) => {
          const { [id]: _, ...rest } = state.tournaments;
          return { tournaments: rest };
        });
      },

      updateConfig: (id: string, configUpdate: Partial<TournamentConfig>) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                config: { ...tournament.config, ...configUpdate },
              },
            },
          };
        });
      },

      addPlayer: (tournamentId: string, name: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;
          const player: Player = {
            id: generateId(),
            name,
            rebuys: 0,
            hasAddon: false,
            isActive: true,
          };
          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players: [...tournament.players, player],
              },
            },
          };
        });
      },

      removePlayer: (tournamentId: string, playerId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament || tournament.status !== "setup") return state;
          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players: tournament.players.filter((p) => p.id !== playerId),
              },
            },
          };
        });
      },

      startTournament: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament || tournament.players.length < 2) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                status: "running",
                timer: { ...tournament.timer, isRunning: true },
              },
            },
          };
        });
      },

      pauseTournament: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                status: "paused",
                timer: { ...tournament.timer, isRunning: false },
              },
            },
          };
        });
      },

      resumeTournament: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          const currentLevel = tournament.config.blindStructure[tournament.timer.currentLevelIndex];
          const status: TournamentStatus = currentLevel?.isBreak ? "break" : "running";
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                status,
                timer: { ...tournament.timer, isRunning: true },
              },
            },
          };
        });
      },

      finishTournament: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          // Assign first place to remaining active player
          const players = tournament.players.map((p) => {
            if (p.isActive && !p.finishPosition) {
              return { ...p, finishPosition: 1, isActive: false };
            }
            return p;
          });
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                players,
                status: "finished",
                timer: { ...tournament.timer, isRunning: false },
              },
            },
          };
        });
      },

      resetTournament: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          const players = tournament.players.map((p) => ({
            ...p,
            isActive: true,
            rebuys: 0,
            hasAddon: false,
            finishPosition: undefined,
            knockedOutInLevel: undefined,
            knockedOutBy: undefined,
          }));
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                players,
                status: "setup",
                timer: {
                  currentLevelIndex: 0,
                  secondsRemaining: tournament.config.blindStructure[0]?.duration ?? 900,
                  isRunning: false,
                },
                knockoutOrder: [],
              },
            },
          };
        });
      },

      tick: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament || !tournament.timer.isRunning) return state;

          const newSeconds = tournament.timer.secondsRemaining - 1;

          if (newSeconds <= 0) {
            // Auto-advance to next level
            const nextIndex = tournament.timer.currentLevelIndex + 1;
            const blinds = tournament.config.blindStructure;
            if (nextIndex >= blinds.length) {
              return {
                tournaments: {
                  ...state.tournaments,
                  [id]: {
                    ...tournament,
                    timer: { ...tournament.timer, secondsRemaining: 0, isRunning: false },
                  },
                },
              };
            }
            const nextLevel = blinds[nextIndex];
            const newStatus: TournamentStatus = nextLevel.isBreak ? "break" : "running";
            return {
              tournaments: {
                ...state.tournaments,
                [id]: {
                  ...tournament,
                  status: newStatus,
                  timer: {
                    currentLevelIndex: nextIndex,
                    secondsRemaining: nextLevel.duration,
                    isRunning: true,
                  },
                },
              },
            };
          }

          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                timer: { ...tournament.timer, secondsRemaining: newSeconds },
              },
            },
          };
        });
      },

      nextLevel: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          const nextIndex = tournament.timer.currentLevelIndex + 1;
          const blinds = tournament.config.blindStructure;
          if (nextIndex >= blinds.length) return state;
          const nextLevel = blinds[nextIndex];
          const newStatus: TournamentStatus = nextLevel.isBreak ? "break" : (tournament.timer.isRunning ? "running" : "paused");
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                status: newStatus,
                timer: {
                  ...tournament.timer,
                  currentLevelIndex: nextIndex,
                  secondsRemaining: nextLevel.duration,
                },
              },
            },
          };
        });
      },

      prevLevel: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          const prevIndex = tournament.timer.currentLevelIndex - 1;
          if (prevIndex < 0) return state;
          const prevLevelData = tournament.config.blindStructure[prevIndex];
          const newStatus: TournamentStatus = prevLevelData.isBreak ? "break" : (tournament.timer.isRunning ? "running" : "paused");
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                status: newStatus,
                timer: {
                  ...tournament.timer,
                  currentLevelIndex: prevIndex,
                  secondsRemaining: prevLevelData.duration,
                },
              },
            },
          };
        });
      },

      resetLevelTimer: (id: string) => {
        set((state) => {
          const tournament = state.tournaments[id];
          if (!tournament) return state;
          const currentLevel = tournament.config.blindStructure[tournament.timer.currentLevelIndex];
          if (!currentLevel) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [id]: {
                ...tournament,
                timer: {
                  ...tournament.timer,
                  secondsRemaining: currentLevel.duration,
                },
              },
            },
          };
        });
      },

      knockoutPlayer: (tournamentId: string, playerId: string, knockedOutByPlayerId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;

          const activeCount = tournament.players.filter((p) => p.isActive).length;
          const finishPosition = activeCount;

          const players = tournament.players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  isActive: false,
                  finishPosition,
                  knockedOutInLevel: tournament.timer.currentLevelIndex + 1,
                  knockedOutBy: knockedOutByPlayerId,
                }
              : p
          );

          const knockoutOrder = [...tournament.knockoutOrder, playerId];
          const newActiveCount = players.filter((p) => p.isActive).length;

          // Auto-finish if only 1 player left
          if (newActiveCount === 1) {
            const finalPlayers = players.map((p) => {
              if (p.isActive) {
                return { ...p, finishPosition: 1, isActive: false };
              }
              return p;
            });
            return {
              tournaments: {
                ...state.tournaments,
                [tournamentId]: {
                  ...tournament,
                  players: finalPlayers,
                  knockoutOrder,
                  status: "finished",
                  timer: { ...tournament.timer, isRunning: false },
                },
              },
            };
          }

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players,
                knockoutOrder,
              },
            },
          };
        });
      },

      undoKnockout: (tournamentId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament || tournament.knockoutOrder.length === 0) return state;
          if (tournament.status === "finished") return state;

          const lastKnockedOutId = tournament.knockoutOrder[tournament.knockoutOrder.length - 1];
          const players = tournament.players.map((p) =>
            p.id === lastKnockedOutId
              ? { ...p, isActive: true, finishPosition: undefined, knockedOutInLevel: undefined, knockedOutBy: undefined }
              : p
          );
          const knockoutOrder = tournament.knockoutOrder.slice(0, -1);

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players,
                knockoutOrder,
              },
            },
          };
        });
      },

      registerRebuy: (tournamentId: string, playerId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;

          const currentLevel = tournament.config.blindStructure[tournament.timer.currentLevelIndex];
          const currentLevelNum = currentLevel?.isBreak
            ? tournament.timer.currentLevelIndex // breaks count as same level
            : tournament.timer.currentLevelIndex + 1;

          // Find actual play level (not counting breaks)
          let playLevel = 0;
          for (let i = 0; i <= tournament.timer.currentLevelIndex; i++) {
            if (!tournament.config.blindStructure[i].isBreak) {
              playLevel = tournament.config.blindStructure[i].level;
            }
          }

          if (playLevel > tournament.config.lastRebuyLevel) return state;

          const player = tournament.players.find((p) => p.id === playerId);
          if (!player) return state;

          // Active player rebuy: just increment count
          if (player.isActive) {
            const players = tournament.players.map((p) =>
              p.id === playerId ? { ...p, rebuys: p.rebuys + 1 } : p
            );
            return {
              tournaments: {
                ...state.tournaments,
                [tournamentId]: { ...tournament, players },
              },
            };
          }

          // Knocked-out player rebuy: reactivate
          const knockoutOrder = tournament.knockoutOrder.filter((id) => id !== playerId);

          const players = tournament.players.map((p) => {
            if (p.id === playerId) {
              return {
                ...p,
                isActive: true,
                rebuys: p.rebuys + 1,
                finishPosition: undefined,
                knockedOutInLevel: undefined,
                knockedOutBy: undefined,
              };
            }
            if (!p.isActive && p.id !== playerId) {
              const posInKnockoutOrder = knockoutOrder.indexOf(p.id);
              if (posInKnockoutOrder !== -1) {
                const totalPlayers = tournament.players.length;
                return {
                  ...p,
                  finishPosition: totalPlayers - posInKnockoutOrder,
                };
              }
            }
            return p;
          });

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players,
                knockoutOrder,
              },
            },
          };
        });
      },

      registerAddon: (tournamentId: string, playerId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;

          const player = tournament.players.find((p) => p.id === playerId);
          if (!player || player.hasAddon) return state;

          const players = tournament.players.map((p) =>
            p.id === playerId ? { ...p, hasAddon: true } : p
          );

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                players,
              },
            },
          };
        });
      },
      duplicateTournament: (sourceId: string) => {
        const source = get().tournaments[sourceId];
        if (!source) return null;

        const id = generateId();
        const today = new Date().toISOString().split("T")[0];
        const config: TournamentConfig = {
          ...source.config,
          id,
          name: source.config.name,
          date: today,
        };

        const players: Player[] = source.players.map((p) => ({
          id: generateId(),
          name: p.name,
          rebuys: 0,
          hasAddon: false,
          isActive: true,
        }));

        const tournament: Tournament = {
          config,
          players,
          timer: {
            currentLevelIndex: 0,
            secondsRemaining: config.blindStructure[0]?.duration ?? 900,
            isRunning: false,
          },
          status: "setup",
          knockoutOrder: [],
        };

        set((state) => ({
          tournaments: { ...state.tournaments, [id]: tournament },
        }));
        return id;
      },

      drawSeats: (tournamentId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament || tournament.players.length === 0) return state;

          // Fisher-Yates shuffle
          const playerIds = tournament.players.map((p) => p.id);
          for (let i = playerIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
          }

          const seatAssignments: SeatAssignment[] = playerIds.map((playerId, i) => ({
            playerId,
            seat: i + 1,
          }));

          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                seatAssignments,
              },
            },
          };
        });
      },

      clearSeats: (tournamentId: string) => {
        set((state) => {
          const tournament = state.tournaments[tournamentId];
          if (!tournament) return state;
          return {
            tournaments: {
              ...state.tournaments,
              [tournamentId]: {
                ...tournament,
                seatAssignments: undefined,
              },
            },
          };
        });
      },
    }),
    {
      name: "poker-tournament-storage",
    }
  )
);
