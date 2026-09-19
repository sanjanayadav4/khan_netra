/**
 * KhanNetra AI Safety Vision — PPE Configuration
 * Central source of truth for all PPE item definitions,
 * compliance thresholds, and mine-type rules.
 */

'use strict';

/** All recognised PPE items with metadata */
const PPE_ITEMS = {
  helmet: {
    id:          'helmet',
    label:       'Safety Helmet',
    shortLabel:  'Helmet',
    regulation:  'CMR 2017, Reg. 95 & Mines Act 1952, Sec 18',
    mandatory:   true,
    description: 'Hard hat / mining helmet (IS 2925 certified)',
    weight:      25,           // weight in compliance score
  },
  safety_vest: {
    id:          'safety_vest',
    label:       'Safety Vest / Hi-Vis Jacket',
    shortLabel:  'Safety Vest',
    regulation:  'CMR 2017, Reg. 94',
    mandatory:   true,
    description: 'High-visibility reflective vest or jacket',
    weight:      20,
  },
  safety_boots: {
    id:          'safety_boots',
    label:       'Safety Boots',
    shortLabel:  'Boots',
    regulation:  'CMR 2017, Reg. 94',
    mandatory:   true,
    description: 'Steel-toe safety boots or gumboots',
    weight:      15,
  },
  goggles: {
    id:          'goggles',
    label:       'Safety Goggles / Eye Protection',
    shortLabel:  'Goggles',
    regulation:  'MSHA 2017, Dust & Chemical Protection Rules',
    mandatory:   false,
    description: 'Safety goggles or face shield',
    weight:      10,
  },
  gloves: {
    id:          'gloves',
    label:       'Safety Gloves',
    shortLabel:  'Gloves',
    regulation:  'CMR 2017, Reg. 94',
    mandatory:   false,
    description: 'Industrial / mining safety gloves',
    weight:      10,
  },
  ear_protection: {
    id:          'ear_protection',
    label:       'Ear Protection',
    shortLabel:  'Ear Prot.',
    regulation:  'Noise Pollution (Reg. & Control) Rules 2000',
    mandatory:   false,
    description: 'Earmuffs or earplugs',
    weight:      8,
  },
  respiratory_mask: {
    id:          'respiratory_mask',
    label:       'Respiratory Mask / Respirator',
    shortLabel:  'Mask',
    regulation:  'MSHA 2017, Dust Control Rules; CMR 2017 Reg. 100',
    mandatory:   false,
    description: 'Dust mask, N95, half-face or full-face respirator',
    weight:      7,
  },
  safety_lamp: {
    id:          'safety_lamp',
    label:       'Mine Safety Lamp',
    shortLabel:  'Safety Lamp',
    regulation:  'CMR 2017, Reg. 151 (Underground mines)',
    mandatory:   false,      // mandatory only underground
    description: 'Cap lamp or hand-held mine safety lamp',
    weight:      5,
  },
};

/** Compliance thresholds */
const THRESHOLDS = {
  COMPLIANT:     85,   // ≥85% → COMPLIANT
  WARNING:       60,   // 60–84% → WARNING
  // <60% → NON_COMPLIANT
};

/** Mine-type specific mandatory items */
const MINE_TYPE_MANDATORY = {
  underground: ['helmet', 'safety_vest', 'safety_boots', 'safety_lamp', 'respiratory_mask'],
  opencast:    ['helmet', 'safety_vest', 'safety_boots', 'ear_protection'],
  default:     ['helmet', 'safety_vest', 'safety_boots'],
};

/**
 * Calculate compliance for a single detected worker.
 * @param {string[]} detected   – PPE item IDs found
 * @param {string}   mineType   – 'underground' | 'opencast' | 'default'
 * @returns {{ score, status, missing, mandatory_missing }}
 */
function calculateCompliance(detected, mineType = 'default') {
  const mandatory = MINE_TYPE_MANDATORY[mineType] || MINE_TYPE_MANDATORY.default;
  const allItems  = Object.keys(PPE_ITEMS);
  const missing   = allItems.filter(id => !detected.includes(id));
  const mandatoryMissing = mandatory.filter(id => !detected.includes(id));

  // Weighted score
  let totalWeight  = 0;
  let earnedWeight = 0;
  for (const id of allItems) {
    const item = PPE_ITEMS[id];
    totalWeight  += item.weight;
    if (detected.includes(id)) earnedWeight += item.weight;
  }
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  let status;
  if (mandatoryMissing.length > 0)    status = 'NON_COMPLIANT';
  else if (score >= THRESHOLDS.COMPLIANT) status = 'COMPLIANT';
  else if (score >= THRESHOLDS.WARNING)   status = 'WARNING';
  else                                    status = 'NON_COMPLIANT';

  return { score, status, missing, mandatory_missing: mandatoryMissing };
}

module.exports = { PPE_ITEMS, THRESHOLDS, MINE_TYPE_MANDATORY, calculateCompliance };
