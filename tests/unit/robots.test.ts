import { describe, expect, it } from 'vitest';
import { createRobotState, robotMealCapacity, robotMeatReward, robotWoodReward } from '../../src/game/robotRules';
import { robotRoute } from '../../src/game/robotNavigation';
import { migrateSave } from '../../src/game/save';

describe('assignable robots', () => {
  it('preserves jobs, pending assignments, goods and uncollected ore on reload', () => {
    const robot = { ...createRobotState(0), job: 'hunt', pendingJob: 'serve', meat: 7, oreWork: 4 };
    const save = migrateSave({ version: 10, upgrades: { robots: 1 }, robots: [robot], station: { robotOreCash: 70 } });
    expect(save.robots[0]).toMatchObject(robot);
    expect(save.station.robotOreCash).toBe(70);
    expect(save.robots).toHaveLength(6);
    expect(migrateSave({ version: 9, upgrades: { robots: 3 } }).robots.every(r => r.job === 'idle')).toBe(true);
    expect(migrateSave({ version: 10, upgrades: { robots: 1 }, robots: [{ job: 'invalid', meat: -8 }] }).robots[0]).toMatchObject({ job: 'idle', meat: 0 });
  });

  it('applies exactly 3.5 times yield without inflating odd meat rewards', () => {
    const robot = createRobotState(0);
    expect(robotMeatReward(robot, 1)).toBe(3);
    expect(robotMeatReward(robot, 1)).toBe(4);
    expect(robotMeatReward(robot, 2)).toBe(7);
    expect(robotMealCapacity(0)).toBe(7);
    expect(robotMealCapacity(1)).toBe(7);
    expect(robotMealCapacity(2)).toBe(14);
    expect(robotWoodReward(robot, 3)).toBe(10);
    const resumed = migrateSave({ version: 10, upgrades: { robots: 1 }, robots: [robot] }).robots[0]!;
    expect(robotWoodReward(resumed, 3)).toBe(11);
  });

  it('routes through a wall opening instead of crossing the wall', () => {
    const blocks = [{ x: 380, y: 0, width: 40, height: 320 }, { x: 380, y: 520, width: 40, height: 280 }];
    const path = robotRoute({ x: 100, y: 100 }, { x: 700, y: 100 }, blocks, 800, 800);
    expect(path.length).toBeGreaterThan(10);
    const crossing = path.filter(p => p.x >= 340 && p.x <= 460);
    expect(crossing.every(p => p.y > 332 && p.y < 508)).toBe(true);
    expect(robotRoute({ x: 100, y: 100 }, { x: 700, y: 100 }, [{ x: 380, y: 0, width: 40, height: 800 }], 800, 800)).toEqual([]);
  });
});
