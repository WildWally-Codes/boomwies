// Two independent knobs per computer player:
//   level      – how well it plays (search depth, memory, mistakes, reading the bidding)
//   aggression – how much risk it takes (bidding thresholds, gambling for extra tricks)

export const LEVELS = ['beginner', 'casual', 'club', 'expert', 'master'];
export const AGGRESSION = ['cautious', 'careful', 'balanced', 'bold', 'reckless'];

const LEVEL_PARAMS = {
  //           sampled deals, time cap, random-card chance, remembers voids, smarter playouts, reads bidding, exact endgame, bid estimate noise
  // simBid: price contracts by simulating sample deals instead of using hand estimates
  beginner: { samples: 0, maxMs: 0, noise: 0.25, voids: false, smart: false, infer: false, endgame: false, bidNoise: 1.2, miserie: false, simBid: false },
  casual: { samples: 12, maxMs: 150, noise: 0.06, voids: false, smart: false, infer: false, endgame: false, bidNoise: 0.6, miserie: true, simBid: false },
  club: { samples: 60, maxMs: 400, noise: 0, voids: true, smart: false, infer: false, endgame: false, bidNoise: 0, miserie: true, simBid: false },
  expert: { samples: 140, maxMs: 700, noise: 0, voids: true, smart: true, infer: true, endgame: false, bidNoise: 0, miserie: true, simBid: true, bidSamples: 32 },
  master: { samples: 220, maxMs: 1000, noise: 0, voids: true, smart: true, infer: true, endgame: true, bidNoise: 0, miserie: true, simBid: true, bidSamples: 48 }
};

export const DEFAULT_AI = { level: 'club', aggression: 'balanced' };

/** Resolves a player's AI settings into concrete parameters. */
export function aiParams(settings = DEFAULT_AI) {
  const level = LEVEL_PARAMS[settings.level] ? settings.level : DEFAULT_AI.level;
  const ai = AGGRESSION.indexOf(settings.aggression);
  const a = (ai < 0 ? 2 : ai) - 2; // -2 cautious … +2 reckless
  return {
    level, ...LEVEL_PARAMS[level], ...(settings.tune || {}), // tune: overrides for experiments
    aggr: a,
    bidShift: 0.45 * a,     // tricks added to the hand estimate when deciding to bid
    riskK: 0.15 * a         // card play: score = mean + riskK × spread
  };
}
