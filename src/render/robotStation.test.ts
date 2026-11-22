import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../game/state';
import { RobotStation } from './robotStation';
import { WALL_Z } from './room';

function station(group: THREE.Group) {
  return Object.assign(Object.create(RobotStation.prototype), { group }) as RobotStation;
}

describe('robot framing points', () => {
  it('uses individual world-space mesh corners without inventing empty station corners', () => {
    const group = new THREE.Group();
    group.position.set(2, 0, 3);
    const robot = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const board = robot.clone();
    board.position.set(3, 2, -1);
    group.add(robot, board);
    const points = station(group).points();
    expect(points).toHaveLength(16);
    expect(points.some(p => p.equals(new THREE.Vector3(1.5, -.5, 2.5)))).toBe(true);
    expect(points.some(p => p.equals(new THREE.Vector3(5.5, 2.5, 2.5)))).toBe(true);
    expect(points.some(p => p.x === 1.5 && p.y === 2.5)).toBe(false);
  });

  it('ignores hidden receipts, unowned robots, and transient payout sprites', () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const hidden = new THREE.Group();
    hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(50, 50, 50)));
    const payout = new THREE.Sprite();
    payout.position.y = 20;
    group.add(hidden, payout);
    expect(station(group).points()).toHaveLength(8);
    expect(station(group).points().every(p => Math.abs(p.y) <= .5)).toBe(true);
    hidden.visible = true;
    expect(station(group).points()).toHaveLength(16);
  });

  it('returns no points for empty or invisible geometry rather than non-finite bounds', () => {
    const group = new THREE.Group();
    expect(station(group).points()).toEqual([]);
    group.add(new THREE.Mesh(new THREE.BufferGeometry()));
    expect(station(group).points()).toEqual([]);
    group.visible = false;
    expect(station(group).points()).toEqual([]);
  });
});

function layoutStation() {
  const paper = () => ({ group: new THREE.Group(), draw: vi.fn() });
  const nodes = {
    group: new THREE.Group(), board: new THREE.Group(), charger: new THREE.Group(),
    motor: new THREE.Group(), hiring: new THREE.Group(), receipt: paper(), awayReceipt: paper(),
    slots: [] as { group: THREE.Group }[],
    offers: (['robot', 'speed', 'capacity', 'autoBuy', 'away', 'cap'] as const).map(action => ({ action, paper: paper() })),
  };
  const model = Object.assign(Object.create(RobotStation.prototype), nodes) as RobotStation;
  return { model, ...nodes };
}

describe('robot view offer layout', () => {
  it('moves the hire box and motor beyond the status cards only in the focused wide view', () => {
    const { model, hiring, motor } = layoutStation();
    model.layout(false, true);
    expect(hiring.position.z).toBeGreaterThan(1.8);
    expect(motor.position.z).toBeGreaterThan(1.8);
    model.layout(false);
    expect(hiring.position.z).toBe(1.25);
    expect(motor.position.z).toBe(1.25);
  });

  it('enlarges portrait tags above the counter and keeps the tilted pegboard in front of the wall', () => {
    const { model, group, board, offers } = layoutStation();
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.14, .07));
    back.position.y = .57;
    board.add(back);
    group.add(board);
    model.layout(true, true);
    expect(board.scale.x).toBeGreaterThan(1);
    expect(board.scale.y).toBeGreaterThan(1);
    group.updateWorldMatrix(true, true);
    expect(new THREE.Box3().setFromObject(board).min.z).toBeGreaterThan(WALL_Z + .1);
    for (const { action, paper } of offers) {
      if (action !== 'robot' && action !== 'speed' && action !== 'capacity') continue;
      expect(paper.group.scale.x).toBe(1.4);
      expect(paper.group.position.y - .125 * paper.group.scale.y * Math.cos(Math.PI / 3)).toBeGreaterThan(0);
    }
  });

  it('restores the existing phone scene layout on leaving the robot view', () => {
    const { model, group, board, offers } = layoutStation();
    model.layout(true, true);
    model.layout(true);
    expect(group.position.z).toBe(-1.7);
    expect(board.rotation.x).toBe(0);
    expect(board.scale.toArray()).toEqual([1, 1, 1]);
    expect(offers.every(({ paper }) => paper.group.scale.equals(new THREE.Vector3(1, 1, 1)))).toBe(true);
  });

  it('redraws larger prices and prerequisite labels even when the game state has not changed', () => {
    const { model, offers } = layoutStation();
    const state = createInitialState(0);
    model.layout(false);
    model.update(state);
    model.layout(true, true);
    model.update(state);
    for (const { paper } of offers) {
      expect(paper.draw).toHaveBeenCalledTimes(2);
      expect(paper.draw.mock.lastCall?.[0].map((line: { size: number }) => line.size)).toEqual([110, 100]);
    }
    model.layout(false);
    model.update(state);
    expect(offers[0]!.paper.draw.mock.lastCall?.[0].map((line: { size: number }) => line.size)).toEqual([68, 65]);
  });
});
