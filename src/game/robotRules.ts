import type { RobotJob, RobotState } from './types';

export const ROBOT_MULTIPLIER = 3.5;
export const ROBOT_JOBS: Record<RobotJob, { label: string; description: string }> = {
  idle: { label: 'Stand by', description: 'Wait here for another assignment.' },
  hunt: { label: 'Hunt bears', description: 'Fight real bears. Bank 3.5× kill cash immediately and carry 3.5× meat to the Cookout.' },
  timber: { label: 'Chop and sell', description: 'Chop real trees for 3.5× logs (10–11 per tree), then carry them to the Timber Post and bank the sale.' },
  serve: { label: 'Serve meals', description: 'Collect ready meat or fish plates and feed villagers. Carry 7 plates, or 14 with the upgraded cook (3.5×). Cash waits at the strongbox.' },
  ore: { label: 'Mine ore', description: 'Dig ore beside the Salvage Rig for 3.5× its crate value. Earnings wait at the ore collection circle.' }
};

export function createRobotState(index: number): RobotState {
  return { job: 'idle', pendingJob: null, x: 7040 + index % 3 * 150, y: 4170 + Math.floor(index / 3) * 180,
    wood: 0, meat: 0, meals: 0, fishMeals: 0, rewardRemainder: 0, woodRemainder: 0, oreWork: 0 };
}

export function robotMealCapacity(cookLevel: number): number { return Math.max(2, cookLevel * 2) * ROBOT_MULTIPLIER; }
export function robotCargo(robot: RobotState): number { return robot.wood + robot.meat + robot.meals + robot.fishMeals; }

export function robotWoodReward(robot: RobotState, base: number): number {
  const value = base * ROBOT_MULTIPLIER + robot.woodRemainder;
  robot.woodRemainder = value % 1;
  return Math.floor(value);
}

/** Preserve the half item between odd-yield kills instead of rounding every reward upward. */
export function robotMeatReward(robot: RobotState, base: number): number {
  const value = base * ROBOT_MULTIPLIER + robot.rewardRemainder;
  robot.rewardRemainder = value % 1;
  return Math.floor(value);
}
