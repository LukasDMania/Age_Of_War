import type { AiDifficultyName } from '@config/ai.config';
import { featureSnapshot } from '@config/features.config';
import { INPUT_DELAY } from '@config/multiplayer.config';
import { LoopbackTransport, type LoopbackOptions } from '@net/transport';
import { loadAccount, lockedPartKeys } from '@state/accountProgress';
import type { GameSceneData } from '@/scenes/GameScene';
import { randomSeed } from '@utils/Rng';

/**
 * Dev only (Phase 22): a lockstep match against a pretend opponent in the
 * same page (`?loopback=80` opens one with 80 ms one-way delay). The enemy
 * side is played by an AI inside the battle, so the lane has a fight; the
 * player's clicks and keys go through the lockstep command queue as they
 * would online.
 */
export function loopbackMatch(
  options: LoopbackOptions & { ai?: AiDifficultyName | 'off'; seed?: number; inputDelayTurns?: number } = {},
): GameSceneData {
  return {
    ai: options.ai ?? 'normal',
    lockstep: {
      setup: {
        seed: options.seed ?? randomSeed(),
        inputDelayTurns: options.inputDelayTurns ?? INPUT_DELAY.default,
        features: featureSnapshot(),
        mechLocked: { player: lockedPartKeys(loadAccount()), enemy: [] },
      },
      localSide: 'player',
      transport: new LoopbackTransport(options),
    },
  };
}
