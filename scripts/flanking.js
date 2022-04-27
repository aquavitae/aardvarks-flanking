/**
 * A creature is flanked if it is within melee reach of two or more opponents
 * wielding melee weapons, and at least two of those opponents are on opposite
 * sides of the creature. An opponent can't flank a creature it can't see, and
 * it can't flank while it is incapacitated. Melee attacks against a flanked
 * creature gain a +1 bonus for each opponent flanking it.
 */

export const moduleName = 'aardvarks-flanking';
export const maxFlankingBonusSetting = 'max-flanking-bonus'
const flankingFlag = 'targetFlankingBonus';

const log = (message, ...args) => {
  // eslint-disable-next-line no-console
  console.info(`${moduleName} | ${message}`, ...args);
};

const isEnemy = (a, b) => a.data.disposition !== b.data.disposition;

const isNotIncapacitated = (t) =>
  t.actor.data.effects.filter(
    (e) => e.label in ['Dead', 'Incapacitated', 'Petrified', 'Paralysed', 'Stunned', 'Unconscious']
  ).length === 0;

const isAdjacent = (tok, target) => {
  const scale = canvas.grid.grid.options.dimensions.distance / canvas.grid.size;
  const dx = Math.abs(tok.center.x - target.center.x) * scale;
  const dy = Math.abs(tok.center.y - target.center.y) * scale;
  const dz = Math.abs(tok.data.elevation - target.data.elevation);

  const getReach = (d) => {
    const defaultRange = d.properties?.rch ? 10 : 5;
    if (d.properties?.thr) {
      return defaultRange;
    }
    return d.range.value || defaultRange;
  };

  const maxAttackReach = Math.max(
    5,
    ...tok.actor.items
      .map((item) => item.data.data)
      .filter((d) => d.actionType === 'mwak')
      .map(getReach)
  );

  const range = maxAttackReach + ((tok.w + target.w) * scale) / 2;

  return dx < range && dy < range && dz < range;
};

const mapState = (tok, target) => ({
  name: tok.data.name,
  x: tok.center.x,
  y: tok.center.y,
  isEnemy: isEnemy(tok, target),
  isNotIncapacitated: isNotIncapacitated(tok),
  isAdjacent: isAdjacent(tok, target),
});

const isFlankingCandidate = (t) => t.isEnemy && t.isNotIncapacitated && t.isAdjacent;

const slope = (a, b) => (a.y - b.y) / (a.x - b.x);

const areOpposite = (a, b, target) => {
  if (a.x === b.x && a.y === b.y) {
    return false;
  }

  const tl = { x: target.x, y: target.y };
  const tr = { x: target.x + target.w, y: target.y };
  const bl = { x: target.x, y: target.y + target.h };
  const br = { x: target.x + target.w, y: target.y + target.h };

  const ab = slope(a, b);
  const above = (p) => p.y <= tl.y && 1 / ab >= 1 / slope(p, tl) && 1 / ab <= 1 / slope(p, tr);
  const below = (p) => p.y >= bl.y && 1 / ab <= 1 / slope(p, bl) && 1 / ab >= 1 / slope(p, br);
  const left = (p) => p.x <= tl.x && ab >= slope(p, tl) && ab <= slope(p, bl);
  const right = (p) => p.x >= br.x && ab <= slope(p, tr) && ab >= slope(p, br);

  const pos = (p) => {
    switch (true) {
      case above(p):
        return 1;
      case below(p):
        return -1;
      case left(p):
        return 2;
      case right(p):
        return -2;
      default:
        return 0;
    }
  };

  const posA = pos(a);
  const posB = pos(b);

  if (posA === 0 || posB === 0) {
    return false;
  }

  return posA + posB === 0;
};

const areTokensOpposite = (states, target) => {
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      if (areOpposite(states[i], states[j], target)) {
        return true;
      }
    }
  }
  return false;
};

const countAdjacent = (target) => {
  const tokenStates = canvas.tokens.objects.children.map((tok) => mapState(tok, target));
  const flanking = tokenStates.filter(isFlankingCandidate);
  const isFlanked = areTokensOpposite(flanking, target);
  const bonus = flanking.length;

  const toString = (a) => `  ${isFlankingCandidate(a) ? '✅' : '❌'} '${JSON.stringify(a)}`;
  const pretty = tokenStates.map((t) => toString(t)).join('\n');
  log(`${target.data.name}: surrounded by ${bonus} actors (${isFlanked ? 'flanking' : 'not flanking'}):\n${pretty}`);

  if (isFlanked) {
    return bonus;
  }

  return 0;
};

const flankingBonus = (n) => {
  const maxBonusSetting = game.settings.get(moduleName, maxFlankingBonusSetting) || 1;
  const maxBonus = maxBonusSetting >= 1 ? maxBonusSetting : 1
  return n > maxBonus ? maxBonus : n
}

const checkFlanking = async (target) => {
  const n = countAdjacent(target);
  if (n >= 2) {
    await game.user.setFlag(moduleName, flankingFlag, flankingBonus(n));
  } else {
    await game.user.unsetFlag(moduleName, flankingFlag);
  }
};

export const onTargetToken = async (user, target, state) => {
  if (user.id === game.userId) {
    if (state) {
      checkFlanking(target);
    } else {
      await user.unsetFlag(moduleName, flankingFlag);
    }
  }
};

export const onUpdateToken = async () => {
  game.user.targets.forEach(async (t) => checkFlanking(t));
};

export const getAttackToHit = (item, roll) => {
  const bonus = game.user.getFlag(moduleName, flankingFlag) || 0;
  const mwak = item?.data?.data?.actionType === 'mwak';

  if (roll !== null && bonus > 0 && mwak) {
    log(`adding flanking bonus: ${bonus}`);
    roll.parts.push(bonus);
  }

  return roll;
};
