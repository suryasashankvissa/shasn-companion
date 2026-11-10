// Ideologue powers from the SHASN rulebook (pages 28 and 32–37).
// Passive: +1 resource of the Ideologue's type for every 2 of their cards you hold.
// Level 3 / Level 5: unlocked while you hold 3 / 5 of their cards (lost again if you drop below).

export const POWERS = {
  capitalist: {
    resource: 'funds',
    resourceName: 'Funds',
    l3: { name: 'Prospecting', short: 'Trade 1 resource for 2', text: 'Once per turn, give 1 resource to the Public Reserve to get up to 2 resources of your choice (take both at the same time; they can be different types).' },
    l5: { name: 'Land Grab', short: 'Evict 3 voters', text: 'Three times per turn, evict any 1 voter from the board and send it back to its player (majority voters too, but not in Volatile Areas). Opponents may place evicted voters back on their next turn.' },
  },
  supremo: {
    resource: 'clout',
    resourceName: 'Clout',
    l3: { name: 'Donations', short: 'Snatch 2 resources', text: 'Twice per turn, snatch 1 resource from another player (both from one player or 1 each from two players).' },
    l5: { name: 'Payback', short: 'Pay 1 to discard 1 voter, up to 2 times', text: "Twice per turn, spend 1 resource of your choice to discard 1 of an opponent's voters (majority voters too, but not in Volatile Areas)." },
  },
  showstopper: {
    resource: 'media',
    resourceName: 'Media',
    l3: { name: 'Going Viral', short: '+1 voter per Voter Card', text: 'Twice per turn, get +1 voter for a Voter Card you influence (on up to 2 different Voter Cards each turn).' },
    l5: { name: 'Election Fever', short: '+1 Gerrymander per zone', text: 'Gerrymander 2 voters instead of 1 in every zone where you have Gerrymandering Rights (majority voters too, but not in Volatile Areas).' },
  },
  idealist: {
    resource: 'trust',
    resourceName: 'Trust',
    l3: { name: 'Helping Hands', short: '2 discounts', text: 'Twice per turn, pay 1 resource less when influencing a Voter Card or buying a Conspiracy Card (split or combine the discounts).' },
    l5: { name: 'Tough Love', short: "Pay 2 Trust + 2 any to convert 2 voters", text: "Once per turn, spend 2 Trust + any 2 resources to convert 2 of an opponent's voters in the same zone into yours (can be discounted with Helping Hands)." },
  },
};

// Works out which built-in Ideologue an ideology type is, from its name.
export function powerKey(type) {
  const n = String(type?.name || '').toLowerCase();
  return Object.keys(POWERS).find((k) => n.includes(k)) || null;
}

// Card counts for one player, with the Jumla card added where it sits.
export function effectiveCounts(state, playerId) {
  const counts = { ...(state.collections?.[playerId] || {}) };
  const j = state.jumla;
  if (j?.holderId === playerId && j.ideologyId) counts[j.ideologyId] = (counts[j.ideologyId] || 0) + 1;
  return counts;
}

// Everything a player has unlocked right now.
export function playerPowers(state, playerId) {
  const counts = effectiveCounts(state, playerId);
  return (state.ideologies || []).map((t) => {
    const key = powerKey(t);
    const n = counts[t.id] || 0;
    const p = key ? POWERS[key] : null;
    return {
      type: t,
      key,
      power: p,
      count: n,
      passive: p ? Math.floor(n / 2) : 0,
      level3: !!p && n >= 3,
      level5: !!p && n >= 5,
      hasJumla: state.jumla?.holderId === playerId && state.jumla?.ideologyId === t.id,
    };
  });
}

// Extra resources from passive powers, e.g. [{kind:'funds', n:1}].
export function passiveBonus(state, playerId) {
  return playerPowers(state, playerId)
    .filter((x) => x.passive > 0)
    .map((x) => ({ kind: x.power.resource, n: x.passive, name: x.power.resourceName }));
}

// Set of unlocked milestones like "playerId|typeId|3" (used to spot new unlocks).
export function milestones(state) {
  const out = new Set();
  for (const p of state.players || []) {
    for (const x of playerPowers(state, p.id)) {
      if (x.level3) out.add(`${p.id}|${x.type.id}|3`);
      if (x.level5) out.add(`${p.id}|${x.type.id}|5`);
    }
  }
  return out;
}
