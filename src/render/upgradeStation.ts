import * as THREE from 'three';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import type { GameState } from '../game/state';
import { upgradePrice, deskSlots, maxBulkLot } from '../game/upgrades';
import { formatCompact } from '../game/format';
import { t } from '../i18n';
import { kioskProp } from './kioskModels';
import { Paper } from './paper';
import { disposeToolObject } from './toolModels';

export const UPGRADE_IDS = ['luck', 'desk', 'bulk'] as const;

export function upgradeEffect(state: GameState, id: UpgradeId): string {
  return t(`upgrade.${id}.effect`, { value: id === 'luck' ? state.upgrades.luck : id === 'desk' ? deskSlots(state) : maxBulkLot(state) });
}

export class UpgradeStation {
  readonly group = new THREE.Group();
  private readonly header = new Paper(1.65, .24);
  private readonly slots = UPGRADE_IDS.map((id, index) => {
    const paper = new Paper(1.5, .35);
    paper.group.position.set(0, 1.7 - index * .7, .28);
    paper.group.traverse(node => { node.userData.action = { kind: 'upgrade', id }; });
    return { id, paper };
  });
  private key = '';

  constructor() {
    this.group.name = 'upgrade-station';
    this.group.add(kioskProp('stand', [1.95, 2.5, .48], undefined, 0x80daca));
    this.header.group.position.set(0, 2.55, .3);
    this.header.draw([{ text: t('upgrade.title'), size: 85, color: '#ba382c' }]);
    this.group.add(this.header.group);
    for (const [index, slot] of this.slots.entries()) {
      const model = kioskProp(slot.id === 'luck' ? 'luckyStar' : slot.id === 'bulk' ? 'bulkChest' : 'counter', [.48, .30, .27]);
      model.position.set(0, 2 - index * .7, .1);
      model.traverse(node => { node.userData.action = { kind: 'upgrade', id: slot.id }; });
      this.group.add(model, slot.paper.group);
    }
  }

  update(state: GameState): void {
    const key = JSON.stringify([state.upgrades, this.slots.map(({ id }) => state.money >= upgradePrice(state, id))]);
    if (key === this.key) return;
    this.key = key;
    for (const { id, paper } of this.slots) {
      const price = upgradePrice(state, id);
      paper.draw([
        { text: `${t(`upgrade.${id}.name`)} · ${t('upgrade.level', { level: state.upgrades[id], max: UPGRADES[id].maxLevel })}`, size: 65 },
        { text: upgradeEffect(state, id), size: 56, color: '#26785e' },
        { text: Number.isFinite(price) ? t('upgrade.buy', { cost: formatCompact(price) }) : t('upgrade.max'), size: 62, color: state.money >= price ? '#26785e' : '#ba382c' },
      ]);
    }
  }

  anchor(id: UpgradeId): THREE.Vector3 {
    this.group.updateWorldMatrix(true, true);
    return this.slots.find(slot => slot.id === id)!.paper.group.getWorldPosition(new THREE.Vector3());
  }

  points(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, true);
    return [-1, 1].flatMap(x => [.0, 2.75].map(y => this.group.localToWorld(new THREE.Vector3(x, y, .3))));
  }

  dispose(): void {
    this.header.texture.dispose();
    this.slots.forEach(slot => slot.paper.texture.dispose());
    disposeToolObject(this.group);
  }
}
