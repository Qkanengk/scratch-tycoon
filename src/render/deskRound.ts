import * as THREE from 'three';
import type { GameState } from '../game/state';
import { currentRound } from '../game/upgrades';
import { t } from '../i18n';
import { canvasTexture } from './assets';
import { drawFace, ticketMetrics, ticketSample } from './ticketFace';
import { Paper } from './paper';
import { inkCard } from './shapes';
import { disposeToolObject } from './toolModels';
import type { RoundLayout } from './roundLayout';

export class DeskRound {
  readonly followers = new THREE.Group();
  readonly pile = new THREE.Group();
  private readonly badge = new Paper(.7, .18);
  private readonly count = new Paper(.7, .18);
  private textures: THREE.Texture[] = [];
  private key = '';
  private cards: THREE.Group[] = [];

  constructor() {
    this.badge.group.rotation.x = -Math.PI / 2;
    this.count.group.rotation.x = -Math.PI / 3;
    this.count.group.position.set(0, .12, .28);
  }

  update(state: GameState, foilMaterial?: THREE.MeshBasicMaterial): void {
    const round = currentRound(state);
    const key = JSON.stringify([round.map(ticket => [ticket.serial, ticket.type, ticket.revealed]), state.deskQueue.length]);
    if (key === this.key) return;
    this.key = key;
    this.followers.remove(this.badge.group);
    this.pile.remove(this.count.group);
    for (const group of [this.followers, this.pile]) for (const child of [...group.children]) disposeToolObject(child);
    this.textures.forEach(texture => texture.dispose());
    this.textures = [];
    this.cards = [];
    for (let index = 1; index < round.length; index++) {
      const ticket = round[index]!;
      const metrics = ticketMetrics(ticket.type);
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = Math.round(1024 * metrics.height);
      drawFace(canvas, ticket.type, ticket, ticket.revealed);
      const texture = canvasTexture(canvas);
      this.textures.push(texture);
      const card = inkCard(1, ticketMetrics(ticket.type).height, texture, .006);
      card.rotation.x = -Math.PI / 2;
      card.traverse(node => { node.userData.action = { kind: 'collect' }; });
      if (foilMaterial && !ticket.revealed) {
        const foil = new THREE.Mesh(new THREE.PlaneGeometry(metrics.window.w, metrics.window.h), foilMaterial.clone());
        foil.material.visible = true;
        foil.position.set(metrics.window.x + metrics.window.w / 2 - .5, metrics.height / 2 - metrics.window.y - metrics.window.h / 2, .004);
        foil.renderOrder = 2;
        card.add(foil);
      }
      this.cards.push(card);
      this.followers.add(card);
    }
    if (round.length > 1) {
      this.badge.draw([{ text: t('desk.round', { count: round.length }), size: 170 }]);
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

  layout(layout: RoundLayout): void {
    this.cards.forEach((card, index) => {
      const tile = layout.tiles[index + 1];
      if (!tile) return;
      card.position.set(tile.x, .031 - .002 * tile.scale, tile.z);
      card.scale.setScalar(tile.scale);
    });
    this.badge.group.position.set(0, .04, layout.badgeZ);
    this.badge.group.scale.setScalar(layout.scale);
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
