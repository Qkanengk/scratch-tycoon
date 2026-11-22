import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RobotStation } from './robotStation';

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
