import * as THREE from 'three';
import type { GameState } from '../game/state';
import { currentRound } from '../game/upgrades';
import { t } from '../i18n';
import { canvasTexture } from './assets';
import { drawFace, ticketMetrics, ticketSample } from './ticketFace';
import { Paper } from './paper';
import { inkCard } from './shapes';
import { disposeToolObject } from './toolModels';

export class DeskRound {
  readonly followers = new THREE.Group();
  readonly pile = new THREE.Group();
  private readonly badge = new Paper(.42, .13);
  private readonly count = new Paper(.7, .18);
  private textures: THREE.Texture[] = [];
  private key = '';

  constructor() {
    this.badge.group.rotation.x = -Math.PI / 2;
    this.count.group.rotation.x = -Math.PI / 3;
    this.count.group.position.set(0, .12, .28);
  }

  update(state: GameState): void {
    const round = currentRound(state);
    const key = JSON.stringify([round.map(ticket => [ticket.serial, ticket.type, ticket.revealed]), state.deskQueue.length]);
    if (key === this.key) return;
    this.key = key;
    this.followers.remove(this.badge.group);
    this.pile.remove(this.count.group);
    for (const group of [this.followers, this.pile]) for (const child of [...group.children]) disposeToolObject(child);
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];
    for (let index = round.length - 1; index >= 1; index--) {
      const ticket = round[index]!;
      const canvas = ticketSample(ticket.type, 512);
      if (ticket.revealed) drawFace(canvas, ticket.type, ticket, true);
      const texture = canvasTexture(canvas);
      this.textures.push(texture);
      const card = inkCard(1, ticketMetrics(ticket.type).height, texture, .006);
      card.rotation.set(-Math.PI / 2, 0, -.035 * index);
      card.position.set(-.065 * index, .023 - .002 * index, -.055 * index);
      this.followers.add(card);
    }
    if (round.length > 1) {
      this.badge.draw([{ text: t('desk.round', { count: round.length }), size: 130 }]);
      this.badge.group.position.set(.38, .065, ticketMetrics(round[0]!.type).height / 2 + .12);
      this.followers.add(this.badge.group);
    }
    if (state.deskQueue.length) {
      const texture = canvasTexture(ticketSample(state.deskQueue[0]!.type, 256));
      this.textures.push(texture);
      for (let i = 0; i < Math.min(5, state.deskQueue.length); i++) {
        const card = inkCard(.4, .5, texture, .008);
        card.rotation.set(-Math.PI / 2, 0, .04 * i);
        card.position.set(i * .01, .025 + i * .012, 0);
        this.pile.add(card);
      }
      this.count.draw([{ text: t('desk.pile', { count: state.deskQueue.length }), size: 95 }]);
      this.pile.add(this.count.group);
    }
  }

  dispose(): void {
    this.followers.remove(this.badge.group); this.pile.remove(this.count.group);
    disposeToolObject(this.followers); disposeToolObject(this.pile);
    this.textures.forEach(texture => texture.dispose());
    this.badge.dispose(); this.count.dispose();
  }

  pilePoints(): THREE.Vector3[] {
    this.pile.updateWorldMatrix(true, false);
    return [-1, 1].flatMap(x => [-1, 1].map(z => this.pile.localToWorld(new THREE.Vector3(x * .4, .1, z * .4))));
  }
}
