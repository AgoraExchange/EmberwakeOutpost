import { Container, Graphics } from 'pixi.js';
import { BRAND } from './config';
import { traceFootprint } from './iso';
import { contactShadow, drawTrailwardenBody, spriteFor } from './visuals';

export function createDefenseVisual(kind: 'spear' | 'archer' | 'turret', advanced: boolean) {
  const container = new Container();
  const base = new Graphics();
  const aim = new Container();
  const flash = new Graphics();
  const height = kind === 'spear' ? 56 : kind === 'archer' ? 116 : 75;
  container.addChild(contactShadow(kind === 'spear' ? 23 : 47, kind === 'spear' ? 10 : 22, .28), base);

  if (kind === 'spear') {
    const villager = spriteFor('actor/villager');
    if (villager) { villager.scale.set(villager.scale.x * .78); container.addChild(villager); }
    else { const body = new Graphics(); drawTrailwardenBody(body); body.scale.set(.7); container.addChild(body); }
    const shield = new Graphics().roundRect(-22, -43, 22, 30, 7).fill(0x426b80).stroke({ color: 0xc4d8d9, width: 3 });
    shield.moveTo(-11, -37).lineTo(-11, -20).moveTo(-17, -28).lineTo(-5, -28).stroke({ color: BRAND.colors.gold, width: 3 });
    container.addChild(shield);
  } else if (kind === 'archer') {
    // Open timber legs leave the walkway visible underneath the elevated platform.
    for (const x of [-29, 29]) {
      base.roundRect(x - 6, -87, 12, 86, 2).fill(0x745037).stroke({ color: 0x3b342a, width: 2 });
      base.moveTo(x - 2, -80).lineTo(x - 2, -5).stroke({ color: 0xb58a5a, width: 2 });
    }
    base.moveTo(-28, -12).lineTo(28, -73).moveTo(28, -12).lineTo(-28, -73).stroke({ color: 0xa6784d, width: 7 });
    traceFootprint(base, 43, 35, -82);
    base.fill(0xad7c4d).stroke({ color: 0x513d2d, width: 4 });
    const archer = spriteFor('actor/villager');
    if (archer) { archer.scale.set(archer.scale.x * .6); archer.position.set(0, -84); container.addChild(archer); }
    else base.roundRect(-12, -133, 24, 48, 7).fill(0x3e7282).circle(0, -141, 10).fill(0xf0cba3);
    const railing = new Graphics();
    railing.moveTo(-51, -80).lineTo(0, -57).lineTo(51, -80).stroke({ color: 0x7c5036, width: 6 });
    railing.moveTo(-51, -80).lineTo(-51, -96).moveTo(51, -80).lineTo(51, -96)
      .stroke({ color: 0xb48558, width: 5 });
    railing.moveTo(-52, -97).lineTo(-38, -91).moveTo(52, -97).lineTo(38, -91).stroke({ color: BRAND.colors.snowHighlight, width: 5 });
    container.addChild(railing);
  } else {
    traceFootprint(base, 42, 34);
    base.fill(0x526572).stroke({ color: 0x283c49, width: 4 });
    base.roundRect(-22, -61, 44, 60, 8).fill(0x385460).stroke({ color: 0x172d3b, width: 3 });
    base.roundRect(-16, -55, 12, 46, 4).fill(0x668393);
    base.ellipse(0, -62, 34, 15).fill(0x7896a2).stroke({ color: 0x193d4d, width: 3 });
    base.ellipse(0, -65, 23, 10).fill(advanced ? 0xffa14f : 0x88dacd);
    for (const y of [-45, -35, -25]) base.roundRect(8, y, 9, 4, 1).fill(advanced ? BRAND.colors.ember : BRAND.colors.safe);
  }

  const weapon = new Graphics();
  if (kind === 'spear') {
    weapon.moveTo(-20, 0).lineTo(39, 0).stroke({ color: 0xa7794d, width: 5, cap: 'round' });
    weapon.moveTo(36, -7).lineTo(56, 0).lineTo(36, 7).closePath().fill(0xe1f1f2).stroke({ color: 0x446775, width: 1.8 });
  } else if (kind === 'archer') {
    weapon.moveTo(2, -23).quadraticCurveTo(28, 0, 2, 23).stroke({ color: 0xd3aa6b, width: 4 });
    weapon.moveTo(2, -23).lineTo(2, 23).stroke({ color: 0xf8efce, width: 1.5 });
    weapon.moveTo(-5, 0).lineTo(31, 0).stroke({ color: 0xe7dec2, width: 2 });
  } else {
    weapon.roundRect(-18, -16, 39, 32, 9).fill(advanced ? 0x795846 : 0x415f6d).stroke({ color: 0x142f40, width: 3 });
    for (const y of advanced ? [-8, 8] : [0]) {
      weapon.roundRect(7, y - 5, 40, 10, 2).fill(0x233b49).stroke({ color: 0xa2bdc5, width: 2 });
      weapon.roundRect(38, y - 6, 12, 12, 2).fill(advanced ? 0xf5a654 : 0x748c97);
    }
    weapon.circle(-6, 0, 6).fill(advanced ? BRAND.colors.ember : BRAND.colors.safe);
  }
  aim.position.set(kind === 'spear' ? 12 : 0, -height);
  aim.rotation = -.25;
  flash.moveTo(46, -4).lineTo(68, -10).lineTo(58, 0).lineTo(68, 10).lineTo(46, 4).closePath().fill(0xffdb86);
  flash.visible = false;
  aim.addChild(weapon, flash);
  container.addChild(aim);
  return { container, aim, flash, height };
}
