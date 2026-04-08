/**
 * stageData.js
 * Stage layout definitions for Explore mode.
 *
 * Coordinate system: 0–100 grid units (matches game coordinate space).
 * The canvas maps these linearly to canvas pixels.
 *
 * Wall format:       { x, y, w, h }   — top-left corner, width, height
 * Shadow / light zones: same format   — areas affecting player exposure
 * Watcher spawn:     { x, y, facing, groupId, patrolPath: [{x,y}…] }
 *
 * Enemy group IDs (keep in sync with ENEMY_GROUPS in exploreMode.js):
 *   0 = standard — balanced sight + hearing
 *   1 = scout    — acute hearing, fast, narrow cone
 *   2 = guardian — wide FOV, poor hearing, slow
 */

export const STAGES = {

  // ── STAGE 1: Security Corridor (indoor) ────────────────────────────────────
  corridor: {
    id:          'corridor',
    name:        'Security Corridor',
    indoor:      true,
    description: 'Narrow indoor corridors. Sound carries far and echoes. Stay silent — guards hear everything.',
    floorColor:      '#0d1420',
    wallColor:       '#253545',
    shadowZoneColor: 'rgba(0,10,30,0.55)',
    lightZoneColor:  'rgba(255,240,180,0.13)',

    playerSpawn:  { x: 8,  y: 50 },
    escapePoints: [{ x: 91, y: 50 }],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Upper horizontal divider  (door gap x = 43–57)
      { x: 3,  y: 34, w: 40,  h: 3   },
      { x: 57, y: 34, w: 40,  h: 3   },
      // Lower horizontal divider  (door gap x = 43–57)
      { x: 3,  y: 63, w: 40,  h: 3   },
      { x: 57, y: 63, w: 40,  h: 3   },
    ],

    // Cover objects — block vision and movement, attenuate sound
    props: [
      { x: 18, y: 44, w: 5, h: 6, type: 'crate'   },
      { x: 75, y: 44, w: 5, h: 6, type: 'crate'   },
      // Desks in the top and bottom rooms
      { x: 14, y: 8,  w: 6, h: 4, type: 'desk'    },
      { x: 72, y: 8,  w: 6, h: 4, type: 'desk'    },
      { x: 14, y: 86, w: 6, h: 4, type: 'desk'    },
      { x: 72, y: 86, w: 6, h: 4, type: 'desk'    },
      // Filing cabinet cluster in top room corner
      { x: 80, y: 23, w: 4, h: 8, type: 'machine' },
    ],

    shadowZones: [
      // Dark corners — top room
      { x: 3,  y: 3,  w: 22, h: 31 },
      { x: 75, y: 3,  w: 22, h: 31 },
      // Dark corners — bottom room
      { x: 3,  y: 66, w: 22, h: 31 },
      { x: 75, y: 66, w: 22, h: 31 },
      // Behind crates in middle corridor
      { x: 13, y: 42, w: 14, h: 12 },
      { x: 70, y: 42, w: 14, h: 12 },
    ],

    lightZones: [
      // Ceiling lights in top and bottom rooms
      { x: 36, y: 6,  w: 28, h: 25 },
      { x: 36, y: 67, w: 28, h: 24 },
    ],

    watcherSpawns: [
      // Guard patrolling top room (left → right)
      {
        x: 25, y: 18, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 10 }, { x: 88, y: 10 },
          { x: 88, y: 30 }, { x: 5, y: 30 },
        ],
      },
      // Scout in bottom room (right → left, acute hearing)
      {
        x: 70, y: 80, facing: Math.PI, groupId: 1,
        patrolPath: [
          { x: 88, y: 88 }, { x: 5, y: 88 },
          { x: 5,  y: 70 }, { x: 88, y: 70 },
        ],
      },
    ],
  },

  // ── STAGE 2: Research Facility (indoor, 3 rooms) ───────────────────────────
  rooms: {
    id:          'rooms',
    name:        'Research Facility',
    indoor:      true,
    description: 'Three connected chambers. Sound echoes between rooms. Guards react to repeated noise.',
    floorColor:      '#0d1218',
    wallColor:       '#1e2a40',
    shadowZoneColor: 'rgba(0,5,20,0.60)',
    lightZoneColor:  'rgba(200,220,255,0.10)',

    playerSpawn:  { x: 8,  y: 50 },
    escapePoints: [{ x: 91, y: 50 }],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Left room divider at x = 31 (door gap y = 44–56)
      { x: 31, y: 3,  w: 3,   h: 41  },
      { x: 31, y: 56, w: 3,   h: 41  },
      // Right room divider at x = 64 (door gap y = 44–56)
      { x: 64, y: 3,  w: 3,   h: 41  },
      { x: 64, y: 56, w: 3,   h: 41  },
    ],

    // Cover props in each room
    props: [
      // Room 1 (left)
      { x: 8,  y: 14, w: 5, h: 5, type: 'desk'    },
      { x: 8,  y: 78, w: 5, h: 5, type: 'desk'    },
      { x: 22, y: 46, w: 5, h: 5, type: 'crate'   },
      // Room 2 (middle)
      { x: 41, y: 11, w: 5, h: 5, type: 'machine' },
      { x: 41, y: 80, w: 5, h: 5, type: 'machine' },
      { x: 48, y: 46, w: 5, h: 5, type: 'crate'   },
      // Room 3 (right)
      { x: 74, y: 14, w: 5, h: 5, type: 'desk'    },
      { x: 74, y: 78, w: 5, h: 5, type: 'desk'    },
      { x: 81, y: 46, w: 5, h: 5, type: 'crate'   },
      // Pillars near doorways
      { x: 29, y: 42, w: 3, h: 3, type: 'pillar'  },
      { x: 62, y: 42, w: 3, h: 3, type: 'pillar'  },
    ],

    shadowZones: [
      { x: 3,  y: 3,  w: 28, h: 22 },
      { x: 3,  y: 72, w: 28, h: 25 },
      { x: 34, y: 3,  w: 30, h: 22 },
      { x: 34, y: 72, w: 30, h: 25 },
      { x: 67, y: 3,  w: 30, h: 22 },
      { x: 67, y: 72, w: 30, h: 25 },
      // Behind central cover blocks
      { x: 5,  y: 43, w: 14, h: 12 },
      { x: 45, y: 43, w: 14, h: 12 },
      { x: 78, y: 43, w: 14, h: 12 },
    ],

    lightZones: [
      // Lit doorway areas (between rooms)
      { x: 5,  y: 40, w: 26, h: 18 },
      { x: 34, y: 40, w: 30, h: 18 },
      { x: 67, y: 40, w: 27, h: 18 },
    ],

    watcherSpawns: [
      // Scout in room 1 — acute hearing
      {
        x: 17, y: 50, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 20 }, { x: 28, y: 20 },
          { x: 28, y: 80 }, { x: 5, y: 80 },
        ],
      },
      // Standard guard in room 2
      {
        x: 48, y: 50, facing: 0, groupId: 0,
        patrolPath: [
          { x: 35, y: 20 }, { x: 62, y: 20 },
          { x: 62, y: 80 }, { x: 35, y: 80 },
        ],
      },
      // Guardian in room 3 — wide FOV
      {
        x: 81, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 67, y: 20 }, { x: 94, y: 20 },
          { x: 94, y: 80 }, { x: 67, y: 80 },
        ],
      },
    ],
  },

  // ── STAGE 3: Open Courtyard (outdoor) ──────────────────────────────────────
  courtyard: {
    id:          'courtyard',
    name:        'Open Courtyard',
    indoor:      false,
    description: 'Exposed outdoor area. Long sightlines, bright light. Collect the access key before reaching the exit.',
    floorColor:      '#0c1008',
    wallColor:       '#1e2812',
    shadowZoneColor: 'rgba(0,20,5,0.50)',
    lightZoneColor:  'rgba(255,255,200,0.08)',

    playerSpawn:  { x: 8,  y: 50 },
    escapePoints: [{ x: 91, y: 50 }],

    // Simple stage objective: collect access key before escaping
    objectives: [
      { id: 'key', type: 'key', pos: { x: 55, y: 50 }, label: 'Access Key', radius: 6 },
    ],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Partial broken-wall barriers (structural, vision-blocking)
      { x: 35, y: 28, w: 3,   h: 20  },
      { x: 62, y: 52, w: 3,   h: 20  },
    ],

    // Cover crates scattered across the courtyard
    props: [
      { x: 18, y: 18, w: 8, h: 8, type: 'crate'   },
      { x: 44, y: 14, w: 8, h: 8, type: 'crate'   },
      { x: 70, y: 18, w: 8, h: 8, type: 'crate'   },
      { x: 14, y: 44, w: 8, h: 8, type: 'crate'   },
      { x: 44, y: 44, w: 8, h: 8, type: 'crate'   },
      { x: 78, y: 44, w: 8, h: 8, type: 'crate'   },
      { x: 18, y: 70, w: 8, h: 8, type: 'crate'   },
      { x: 44, y: 74, w: 8, h: 8, type: 'crate'   },
      { x: 70, y: 70, w: 8, h: 8, type: 'crate'   },
      // Abandoned vehicles providing heavier cover
      { x: 58, y: 14, w: 10, h: 6, type: 'vehicle' },
      { x: 22, y: 78, w: 10, h: 6, type: 'vehicle' },
    ],

    shadowZones: [
      // Behind each crate
      { x: 16, y: 16, w: 13, h: 13 },
      { x: 42, y: 12, w: 13, h: 13 },
      { x: 68, y: 16, w: 13, h: 13 },
      { x: 12, y: 42, w: 13, h: 13 },
      { x: 42, y: 42, w: 13, h: 13 },
      { x: 76, y: 42, w: 13, h: 13 },
      { x: 16, y: 68, w: 13, h: 13 },
      { x: 42, y: 72, w: 13, h: 13 },
      { x: 68, y: 68, w: 13, h: 13 },
      // Behind barriers
      { x: 30, y: 26, w: 10, h: 24 },
      { x: 58, y: 50, w: 10, h: 24 },
      // Behind vehicles
      { x: 56, y: 12, w: 14, h: 10 },
      { x: 20, y: 76, w: 14, h: 10 },
    ],

    lightZones: [
      // Left open lane (player entry side)
      { x: 3,  y: 30, w: 10, h: 40 },
      // Right open lane (exit side)
      { x: 87, y: 30, w: 10, h: 40 },
      // Central exposed area — dangerous in daylight
      { x: 38, y: 38, w: 24, h: 24 },
    ],

    watcherSpawns: [
      // Guardian sweeping the top edge — wide FOV, outdoor vantage
      {
        x: 50, y: 8, facing: Math.PI / 2, groupId: 2,
        patrolPath: [
          { x: 8, y: 8 }, { x: 90, y: 8 },
        ],
      },
      // Scout patrolling the bottom edge — acute hearing
      {
        x: 50, y: 90, facing: -Math.PI / 2, groupId: 1,
        patrolPath: [
          { x: 90, y: 90 }, { x: 8, y: 90 },
        ],
      },
      // Standard guard pacing the middle-left open lane
      {
        x: 8, y: 50, facing: Math.PI / 2, groupId: 0,
        patrolPath: [
          { x: 8, y: 8 }, { x: 8, y: 90 },
        ],
      },
    ],
  },

  // ── STAGE 4: Secure Compound (mixed outdoor + indoor) ──────────────────────
  compound: {
    id:          'compound',
    name:        'Secure Compound',
    indoor:      false,
    description: 'Cross the yard, enter the building, activate the power switch, then reach the secure exit.',
    floorColor:      '#0c1008',
    wallColor:       '#1e2812',
    shadowZoneColor: 'rgba(0,15,5,0.55)',
    lightZoneColor:  'rgba(255,240,200,0.10)',

    playerSpawn:  { x: 8,  y: 50 },
    escapePoints: [{ x: 91, y: 50 }],

    // Stage objective: activate the power switch inside the building
    objectives: [
      { id: 'switch', type: 'switch', pos: { x: 78, y: 50 }, label: 'Power Switch', radius: 6 },
    ],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Building outer left wall (door gap y = 44–56)
      { x: 55, y: 3,  w: 3,   h: 41  },
      { x: 55, y: 56, w: 3,   h: 41  },
      // Building interior divider (door gap x = 76–88)
      { x: 58, y: 35, w: 18,  h: 3   },
      { x: 88, y: 35, w: 9,   h: 3   },
      { x: 58, y: 63, w: 18,  h: 3   },
      { x: 88, y: 63, w: 9,   h: 3   },
      // Outdoor fence / partial wall
      { x: 28, y: 34, w: 3,   h: 28  },
    ],

    // Outdoor cover objects and indoor machines
    props: [
      // Outdoor yard
      { x: 14, y: 14, w: 8, h: 8, type: 'crate'   },
      { x: 35, y: 8,  w: 8, h: 8, type: 'crate'   },
      { x: 14, y: 76, w: 8, h: 8, type: 'crate'   },
      { x: 35, y: 78, w: 8, h: 8, type: 'crate'   },
      { x: 42, y: 44, w: 6, h: 8, type: 'machine' },
      // Indoor building
      { x: 60, y: 38, w: 6, h: 5, type: 'desk'    },
      { x: 60, y: 55, w: 6, h: 5, type: 'desk'    },
      { x: 88, y: 38, w: 6, h: 5, type: 'machine' },
      { x: 88, y: 55, w: 6, h: 5, type: 'machine' },
    ],

    shadowZones: [
      // Behind outdoor obstacles
      { x: 12, y: 12, w: 12, h: 12 },
      { x: 33, y: 6,  w: 12, h: 12 },
      { x: 12, y: 74, w: 12, h: 12 },
      { x: 33, y: 76, w: 12, h: 12 },
      { x: 25, y: 32, w: 10, h: 30 },
      // Indoor building corners
      { x: 58, y: 6,  w: 39, h: 27 },
      { x: 58, y: 66, w: 39, h: 29 },
    ],

    lightZones: [
      // Outdoor open corridor (player start lane)
      { x: 3,  y: 40, w: 10, h: 20 },
      // Building lit interior
      { x: 58, y: 38, w: 39, h: 25 },
    ],

    watcherSpawns: [
      // Standard guard patrolling outdoor yard
      {
        x: 28, y: 50, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 55 }, { x: 52, y: 55 },
          { x: 52, y: 30 }, { x: 5, y: 30 },
        ],
      },
      // Guardian inside the building
      {
        x: 75, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 60, y: 40 }, { x: 94, y: 40 },
          { x: 94, y: 60 }, { x: 60, y: 60 },
        ],
      },
      // Scout patrolling the top of the outdoor area
      {
        x: 25, y: 12, facing: Math.PI / 2, groupId: 1,
        patrolPath: [
          { x: 5, y: 12 }, { x: 52, y: 12 },
        ],
      },
    ],
  },

};

export const STAGE_ORDER = ['corridor', 'rooms', 'courtyard', 'compound'];

/**
 * Return the stage definition for the given id, falling back to 'corridor'.
 * @param {string} id
 * @returns {object}
 */
export function getStage(id) {
  return STAGES[id] || STAGES.corridor;
}
