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
  // (difficulty: ★☆☆☆☆)
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
  // (difficulty: ★★☆☆☆)
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
        x: 5, y: 20, facing: 0, groupId: 1,
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
  // (difficulty: ★★★☆☆)
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
      { id: 'key', type: 'key', pos: { x: 55, y: 50 }, label: 'Access Key', radius: 2 },
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
        x: 8, y: 70, facing: Math.PI / 2, groupId: 0,
        patrolPath: [
          { x: 8, y: 8 }, { x: 8, y: 90 },
        ],
      },
    ],
  },

  // ── STAGE 4: Secure Compound (mixed outdoor + indoor) ──────────────────────
  // (difficulty: ★★★☆☆)
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
      { id: 'switch', type: 'switch', pos: { x: 78, y: 50 }, label: 'Power Switch', radius: 2 },
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
        x: 52, y: 55, facing: 0, groupId: 0,
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

  // ── STAGE 5: Server Room (indoor, high security) ──────────────────────────
  // (difficulty: ★★★☆☆)
  server_room: {
    id:          'server_room',
    name:        'Server Room',
    indoor:      true,
    description: 'Dense rows of server racks. Collect the access card and data drive before escaping. Guards patrol narrow aisles.',
    floorColor:      '#080e14',
    wallColor:       '#0f2030',
    shadowZoneColor: 'rgba(0,20,40,0.65)',
    lightZoneColor:  'rgba(0,200,255,0.10)',

    playerSpawn:  { x: 6,  y: 50 },
    escapePoints: [{ x: 92, y: 50 }],

    objectives: [
      { id: 'card',  type: 'key',    pos: { x: 48, y: 22 }, label: 'Access Card',  radius: 2 },
      { id: 'drive', type: 'switch', pos: { x: 48, y: 78 }, label: 'Data Drive',   radius: 2 },
    ],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Server rack rows — top bank (gap at x = 30–36 and x = 60–66)
      { x: 3,  y: 18, w: 27,  h: 4   },
      { x: 36, y: 18, w: 24,  h: 4   },
      { x: 66, y: 18, w: 31,  h: 4   },
      // Server rack rows — bottom bank (gap at x = 30–36 and x = 60–66)
      { x: 3,  y: 78, w: 27,  h: 4   },
      { x: 36, y: 78, w: 24,  h: 4   },
      { x: 66, y: 78, w: 31,  h: 4   },
      // Vertical spine wall in the centre (door gap y = 44–56)
      { x: 49, y: 3,  w: 3,   h: 41  },
      { x: 49, y: 56, w: 3,   h: 41  },
    ],

    props: [
      // Server cabinet clusters — top aisle
      { x: 6,  y: 6,  w: 6, h: 10, type: 'machine' },
      { x: 18, y: 6,  w: 6, h: 10, type: 'machine' },
      { x: 38, y: 6,  w: 6, h: 10, type: 'machine' },
      { x: 54, y: 6,  w: 6, h: 10, type: 'machine' },
      { x: 70, y: 6,  w: 6, h: 10, type: 'machine' },
      { x: 84, y: 6,  w: 6, h: 10, type: 'machine' },
      // Server cabinet clusters — bottom aisle
      { x: 6,  y: 84, w: 6, h: 10, type: 'machine' },
      { x: 18, y: 84, w: 6, h: 10, type: 'machine' },
      { x: 38, y: 84, w: 6, h: 10, type: 'machine' },
      { x: 54, y: 84, w: 6, h: 10, type: 'machine' },
      { x: 70, y: 84, w: 6, h: 10, type: 'machine' },
      { x: 84, y: 84, w: 6, h: 10, type: 'machine' },
      // Central desk cluster
      { x: 38, y: 46, w: 5, h: 5,  type: 'desk'    },
      { x: 55, y: 46, w: 5, h: 5,  type: 'desk'    },
    ],

    shadowZones: [
      // Between server rows — deep shadow
      { x: 3,  y: 22, w: 94, h: 14 },
      { x: 3,  y: 64, w: 94, h: 14 },
      // Corners behind machines
      { x: 3,  y: 3,  w: 16, h: 14 },
      { x: 78, y: 3,  w: 16, h: 14 },
      { x: 3,  y: 83, w: 16, h: 14 },
      { x: 78, y: 83, w: 16, h: 14 },
      // Behind centre wall
      { x: 38, y: 44, w: 10, h: 10 },
      { x: 52, y: 44, w: 10, h: 10 },
    ],

    lightZones: [
      // Status indicator lights over the centre spine
      { x: 45, y: 36, w: 14, h: 28 },
      // Entry/exit corridors lit from overhead
      { x: 3,  y: 40, w: 10, h: 20 },
      { x: 85, y: 40, w: 10, h: 20 },
    ],

    watcherSpawns: [
      // Scout patrolling top aisle — acute hearing
      {
        x: 25, y: 10, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 10 }, { x: 94, y: 10 },
        ],
      },
      // Standard guard patrolling bottom aisle
      {
        x: 70, y: 88, facing: Math.PI, groupId: 0,
        patrolPath: [
          { x: 94, y: 88 }, { x: 5, y: 88 },
        ],
      },
      // Guardian blocking centre spine — wide FOV
      {
        x: 75, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 54, y: 50 }, { x: 94, y: 50 },
        ],
      },
      // Standard guard near spawn, patrolling left aisle
      {
        x: 46, y: 30, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 30 }, { x: 5, y: 70 },
          { x: 46, y: 70 }, { x: 46, y: 30 },
        ],
      },
    ],
  },

  // ── STAGE 6: Rooftop Escape (outdoor, exposed) ────────────────────────────
  // (difficulty: ★★★★☆)
  rooftop: {
    id:          'rooftop',
    name:        'Rooftop Escape',
    indoor:      false,
    description: 'Exposed rooftop with AC units and ventilation shafts. Minimal cover, harsh lighting. Retrieve the signal booster before escaping.',
    floorColor:      '#0a0c10',
    wallColor:       '#1a1e28',
    shadowZoneColor: 'rgba(0,5,15,0.45)',
    lightZoneColor:  'rgba(180,200,255,0.15)',

    playerSpawn:  { x: 6,  y: 50 },
    escapePoints: [{ x: 92, y: 50 }],

    objectives: [
      { id: 'booster', type: 'key', pos: { x: 50, y: 50 }, label: 'Signal Booster', radius: 2 },
    ],

    walls: [
      // Outer border — parapet walls
      { x: 0,  y: 0,  w: 100, h: 4   },
      { x: 0,  y: 96, w: 100, h: 4   },
      { x: 0,  y: 0,  w: 4,   h: 100 },
      { x: 96, y: 0,  w: 4,   h: 100 },
      // Raised AC housing units (partial walls, no gaps)
      { x: 22, y: 22, w: 4,   h: 20  },
      { x: 22, y: 58, w: 4,   h: 20  },
      { x: 72, y: 22, w: 4,   h: 20  },
      { x: 72, y: 58, w: 4,   h: 20  },
      // Ventilation duct running across the middle (gap at y = 44–56)
      { x: 38, y: 4,  w: 3,   h: 40  },
      { x: 38, y: 56, w: 3,   h: 40  },
    ],

    props: [
      // AC units scattered around rooftop
      { x: 8,  y: 18, w: 8, h: 8,  type: 'machine' },
      { x: 8,  y: 74, w: 8, h: 8,  type: 'machine' },
      { x: 42, y: 14, w: 8, h: 8,  type: 'machine' },
      { x: 42, y: 78, w: 8, h: 8,  type: 'machine' },
      { x: 78, y: 14, w: 8, h: 8,  type: 'machine' },
      { x: 78, y: 78, w: 8, h: 8,  type: 'machine' },
      // Vents and skylights providing light cover
      { x: 56, y: 44, w: 10, h: 10, type: 'crate'  },
      { x: 28, y: 44, w: 8,  h: 8,  type: 'crate'  },
    ],

    shadowZones: [
      // Shadows cast by AC units
      { x: 6,  y: 16, w: 14, h: 14 },
      { x: 6,  y: 72, w: 14, h: 14 },
      { x: 40, y: 12, w: 14, h: 14 },
      { x: 40, y: 76, w: 14, h: 14 },
      { x: 76, y: 12, w: 14, h: 14 },
      { x: 76, y: 76, w: 14, h: 14 },
      // Behind ventilation duct
      { x: 26, y: 42, w: 14, h: 14 },
      { x: 54, y: 42, w: 14, h: 14 },
      // Corner shadows by parapet
      { x: 4,  y: 4,  w: 12, h: 12 },
      { x: 84, y: 4,  w: 12, h: 12 },
      { x: 4,  y: 84, w: 12, h: 12 },
      { x: 84, y: 84, w: 12, h: 12 },
    ],

    lightZones: [
      // Rooftop is heavily lit — large light zones
      { x: 4,  y: 30, w: 16, h: 40 },
      { x: 28, y: 4,  w: 40, h: 26 },
      { x: 28, y: 70, w: 40, h: 26 },
      { x: 54, y: 36, w: 38, h: 28 },
      // Entry / exit lanes are spotlight lit
      { x: 80, y: 38, w: 14, h: 22 },
    ],

    watcherSpawns: [
      // Scout sweeping top edge fast
      {
        x: 20, y: 12, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 12 }, { x: 92, y: 12 },
        ],
      },
      // Scout sweeping bottom edge fast
      {
        x: 70, y: 88, facing: Math.PI, groupId: 1,
        patrolPath: [
          { x: 92, y: 88 }, { x: 5, y: 88 },
        ],
      },
      // Guardian patrolling the centre right half — wide FOV
      {
        x: 70, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 44, y: 30 }, { x: 92, y: 30 },
          { x: 92, y: 70 }, { x: 44, y: 70 },
        ],
      },
      // Standard guard on the left half
      {
        x: 36, y: 30, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 30 }, { x: 36, y: 30 },
          { x: 36, y: 70 }, { x: 5, y: 70 },
        ],
      },
    ],
  },

  // ── STAGE 7: Industrial Warehouse (indoor, large) ────────────────────────
  // (difficulty: ★★★★☆)
  warehouse: {
    id:          'warehouse',
    name:        'Industrial Warehouse',
    indoor:      true,
    description: 'Towering shelving aisles and loading bays. Collect the keycard and security chip. Guards patrol the aisles in overlapping patterns.',
    floorColor:      '#0c0e0a',
    wallColor:       '#1c2018',
    shadowZoneColor: 'rgba(0,10,0,0.60)',
    lightZoneColor:  'rgba(255,200,80,0.12)',

    playerSpawn:  { x: 6,  y: 50 },
    escapePoints: [{ x: 92, y: 50 }],

    objectives: [
      { id: 'keycard', type: 'key',    pos: { x: 30, y: 20 }, label: 'Keycard',       radius: 2 },
      { id: 'chip',    type: 'switch', pos: { x: 65, y: 78 }, label: 'Security Chip', radius: 2 },
    ],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Shelving row 1 — top (gap at x = 48–58)
      { x: 3,  y: 25, w: 45,  h: 3   },
      { x: 58, y: 25, w: 39,  h: 3   },
      // Shelving row 2 — upper middle (gap at x = 20–30 and x = 68–78)
      { x: 3,  y: 43, w: 17,  h: 3   },
      { x: 30, y: 43, w: 38,  h: 3   },
      { x: 78, y: 43, w: 19,  h: 3   },
      // Shelving row 3 — lower middle (gap at x = 20–30 and x = 68–78)
      { x: 3,  y: 57, w: 17,  h: 3   },
      { x: 30, y: 57, w: 38,  h: 3   },
      { x: 78, y: 57, w: 19,  h: 3   },
      // Shelving row 4 — bottom (gap at x = 40–52)
      { x: 3,  y: 75, w: 37,  h: 3   },
      { x: 52, y: 75, w: 45,  h: 3   },
    ],

    props: [
      // Forklift and pallet stacks in aisles
      { x: 10, y: 6,  w: 6, h: 6, type: 'vehicle' },
      { x: 50, y: 6,  w: 6, h: 6, type: 'crate'   },
      { x: 78, y: 6,  w: 6, h: 6, type: 'crate'   },
      { x: 10, y: 29, w: 6, h: 6, type: 'crate'   },
      { x: 35, y: 34, w: 6, h: 6, type: 'crate'   },
      { x: 60, y: 29, w: 6, h: 6, type: 'crate'   },
      { x: 84, y: 34, w: 6, h: 6, type: 'crate'   },
      { x: 10, y: 47, w: 6, h: 6, type: 'crate'   },
      { x: 45, y: 47, w: 6, h: 6, type: 'machine' },
      { x: 84, y: 47, w: 6, h: 6, type: 'crate'   },
      { x: 10, y: 61, w: 6, h: 6, type: 'crate'   },
      { x: 45, y: 61, w: 6, h: 6, type: 'crate'   },
      { x: 84, y: 61, w: 6, h: 6, type: 'machine' },
      { x: 20, y: 79, w: 6, h: 6, type: 'crate'   },
      { x: 60, y: 79, w: 6, h: 6, type: 'crate'   },
      { x: 84, y: 82, w: 6, h: 6, type: 'crate'   },
    ],

    shadowZones: [
      // Deep shadows between shelf rows
      { x: 3,  y: 28, w: 94, h: 14 },
      { x: 3,  y: 60, w: 94, h: 14 },
      // Corner loading dock areas
      { x: 3,  y: 3,  w: 20, h: 20 },
      { x: 77, y: 3,  w: 20, h: 20 },
      { x: 3,  y: 78, w: 20, h: 16 },
      { x: 77, y: 78, w: 20, h: 16 },
      // Behind forklifts/crates in aisles
      { x: 8,  y: 45, w: 10, h: 8  },
      { x: 43, y: 45, w: 10, h: 8  },
      { x: 82, y: 45, w: 10, h: 8  },
    ],

    lightZones: [
      // Overhead fluorescent strips in aisles
      { x: 3,  y: 3,  w: 94, h: 20 },
      { x: 22, y: 46, w: 56, h: 8  },
      { x: 3,  y: 79, w: 94, h: 15 },
    ],

    watcherSpawns: [
      // Scout patrolling top aisle rapidly
      {
        x: 30, y: 12, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 12 }, { x: 94, y: 12 },
        ],
      },
      // Standard guard — top middle aisle
      {
        x: 60, y: 35, facing: Math.PI, groupId: 0,
        patrolPath: [
          { x: 5, y: 35 }, { x: 94, y: 35 },
          { x: 94, y: 28 }, { x: 5, y: 28 },
        ],
      },
      // Standard guard — bottom middle aisle
      {
        x: 30, y: 65, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 65 }, { x: 94, y: 65 },
          { x: 94, y: 59 }, { x: 5, y: 59 },
        ],
      },
      // Scout in bottom aisle
      {
        x: 70, y: 86, facing: Math.PI, groupId: 1,
        patrolPath: [
          { x: 94, y: 86 }, { x: 5, y: 86 },
        ],
      },
      // Guardian blocking the exit corridor
      {
        x: 85, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 80, y: 30 }, { x: 94, y: 30 },
          { x: 94, y: 70 }, { x: 80, y: 70 },
        ],
      },
    ],
  },

  // ── STAGE 8: Underground Tunnel (indoor, dark and narrow) ────────────────
  // (difficulty: ★★★★☆)
  tunnel: {
    id:          'tunnel',
    name:        'Underground Tunnel',
    indoor:      true,
    description: 'Dark maintenance tunnels beneath the facility. Sound echoes far. Collect the master key to unlock the exit gate.',
    floorColor:      '#06080c',
    wallColor:       '#0e1420',
    shadowZoneColor: 'rgba(0,5,20,0.75)',
    lightZoneColor:  'rgba(255,120,0,0.12)',

    playerSpawn:  { x: 6,  y: 50 },
    escapePoints: [{ x: 92, y: 50 }],

    objectives: [
      { id: 'master_key', type: 'key', pos: { x: 50, y: 72 }, label: 'Master Key', radius: 2 },
    ],

    walls: [
      // Outer border
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Upper tunnel wall — main horizontal shaft
      { x: 3,  y: 40, w: 94,  h: 3   },
      // Lower tunnel wall — main horizontal shaft
      { x: 3,  y: 57, w: 94,  h: 3   },
      // Vertical cross-shafts dividing space (door gaps in middle zone)
      { x: 25, y: 3,  w: 3,   h: 37  },
      { x: 25, y: 60, w: 3,   h: 37  },
      { x: 50, y: 3,  w: 3,   h: 37  },
      { x: 50, y: 60, w: 3,   h: 37  },
      { x: 72, y: 3,  w: 3,   h: 37  },
      { x: 72, y: 60, w: 3,   h: 37  },
    ],

    props: [
      // Pipes and debris — cover in the tunnels
      { x: 8,  y: 24, w: 5, h: 5,  type: 'crate'   },
      { x: 30, y: 10, w: 5, h: 5,  type: 'crate'   },
      { x: 55, y: 18, w: 5, h: 5,  type: 'machine' },
      { x: 78, y: 8,  w: 5, h: 5,  type: 'crate'   },
      { x: 14, y: 44, w: 5, h: 5,  type: 'crate'   },
      { x: 38, y: 44, w: 5, h: 5,  type: 'machine' },
      { x: 60, y: 44, w: 5, h: 5,  type: 'crate'   },
      { x: 82, y: 44, w: 5, h: 5,  type: 'crate'   },
      { x: 8,  y: 74, w: 5, h: 5,  type: 'crate'   },
      { x: 30, y: 80, w: 5, h: 5,  type: 'crate'   },
      { x: 55, y: 76, w: 5, h: 5,  type: 'machine' },
      { x: 78, y: 88, w: 5, h: 5,  type: 'crate'   },
    ],

    shadowZones: [
      // Upper tunnel rooms are very dark
      { x: 3,  y: 3,  w: 22, h: 37 },
      { x: 28, y: 3,  w: 22, h: 37 },
      { x: 53, y: 3,  w: 19, h: 37 },
      { x: 75, y: 3,  w: 22, h: 37 },
      // Lower tunnel rooms
      { x: 3,  y: 60, w: 22, h: 37 },
      { x: 28, y: 60, w: 22, h: 37 },
      { x: 53, y: 60, w: 19, h: 37 },
      { x: 75, y: 60, w: 22, h: 37 },
      // Behind pipe cover in main shaft
      { x: 12, y: 42, w: 10, h: 8  },
      { x: 36, y: 42, w: 10, h: 8  },
      { x: 58, y: 42, w: 10, h: 8  },
      { x: 80, y: 42, w: 10, h: 8  },
    ],

    lightZones: [
      // Emergency strip lights in main corridor
      { x: 5,  y: 41, w: 85, h: 15 },
      // Single caged light over spawn
      { x: 3,  y: 40, w: 10, h: 17 },
      // Exit corridor light
      { x: 83, y: 40, w: 10, h: 17 },
    ],

    watcherSpawns: [
      // Standard guard patrolling the main shaft
      {
        x: 40, y: 50, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 50 }, { x: 94, y: 50 },
        ],
      },
      // Scout patrolling upper-left rooms — acute hearing
      {
        x: 14, y: 20, facing: Math.PI / 2, groupId: 1,
        patrolPath: [
          { x: 5, y: 5 }, { x: 22, y: 5 },
          { x: 22, y: 38 }, { x: 5, y: 38 },
        ],
      },
      // Scout patrolling lower-right rooms
      {
        x: 78, y: 80, facing: -Math.PI / 2, groupId: 1,
        patrolPath: [
          { x: 75, y: 95 }, { x: 94, y: 95 },
          { x: 94, y: 62 }, { x: 75, y: 62 },
        ],
      },
      // Guardian patrolling centre shaft area — wide FOV
      {
        x: 60, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 28, y: 50 }, { x: 94, y: 50 },
        ],
      },
    ],
  },

  // ── STAGE 9: Night Plaza (outdoor, hostile) ────────────────────────────────
  // (difficulty: ★★★★★)
  plaza: {
    id:          'plaza',
    name:        'Night Plaza',
    indoor:      false,
    description: 'Floodlit plaza in the dead of night. Sparse cover, roaming patrols. Recover the evidence cache and encrypted drive before reaching the exit.',
    floorColor:      '#060810',
    wallColor:       '#121828',
    shadowZoneColor: 'rgba(0,5,20,0.55)',
    lightZoneColor:  'rgba(255,230,100,0.18)',

    playerSpawn:  { x: 6,  y: 50 },
    escapePoints: [{ x: 92, y: 50 }],

    objectives: [
      { id: 'evidence', type: 'key',    pos: { x: 30, y: 30 }, label: 'Evidence Cache',    radius: 2 },
      { id: 'enc_drv',  type: 'switch', pos: { x: 65, y: 72 }, label: 'Encrypted Drive',   radius: 2 },
    ],

    walls: [
      // Outer perimeter wall
      { x: 0,  y: 0,  w: 100, h: 4   },
      { x: 0,  y: 96, w: 100, h: 4   },
      { x: 0,  y: 0,  w: 4,   h: 100 },
      { x: 96, y: 0,  w: 4,   h: 100 },
      // Decorative fountain / planter walls in centre
      { x: 40, y: 36, w: 20,  h: 3   },
      { x: 40, y: 61, w: 20,  h: 3   },
      { x: 40, y: 36, w: 3,   h: 28  },
      { x: 57, y: 36, w: 3,   h: 28  },
      // Parked vehicles as barriers
      { x: 20, y: 44, w: 10,  h: 6   },
      { x: 68, y: 44, w: 10,  h: 6   },
    ],

    props: [
      // Bollards and benches
      { x: 14, y: 14, w: 5, h: 5,  type: 'pillar' },
      { x: 80, y: 14, w: 5, h: 5,  type: 'pillar' },
      { x: 14, y: 80, w: 5, h: 5,  type: 'pillar' },
      { x: 80, y: 80, w: 5, h: 5,  type: 'pillar' },
      // Dumpsters
      { x: 8,  y: 30, w: 7, h: 7,  type: 'crate'  },
      { x: 8,  y: 63, w: 7, h: 7,  type: 'crate'  },
      { x: 84, y: 30, w: 7, h: 7,  type: 'crate'  },
      { x: 84, y: 63, w: 7, h: 7,  type: 'crate'  },
      // News kiosk
      { x: 46, y: 12, w: 8, h: 6,  type: 'desk'   },
      { x: 46, y: 82, w: 8, h: 6,  type: 'desk'   },
    ],

    shadowZones: [
      // Thin shadows behind bollards / dumpsters only — plaza is well lit
      { x: 6,  y: 28, w: 12, h: 12 },
      { x: 6,  y: 61, w: 12, h: 12 },
      { x: 82, y: 28, w: 12, h: 12 },
      { x: 82, y: 61, w: 12, h: 12 },
      // Inner courtyard of fountain enclosure
      { x: 43, y: 39, w: 14, h: 22 },
    ],

    lightZones: [
      // Multiple strong floodlights covering the plaza
      { x: 4,  y: 4,  w: 30, h: 30 },
      { x: 66, y: 4,  w: 30, h: 30 },
      { x: 4,  y: 66, w: 30, h: 30 },
      { x: 66, y: 66, w: 30, h: 30 },
      // Centre spotlight ring
      { x: 30, y: 38, w: 40, h: 24 },
      // Entry / exit lane
      { x: 4,  y: 38, w: 14, h: 24 },
      { x: 82, y: 38, w: 14, h: 24 },
    ],

    watcherSpawns: [
      // Scout sweeping north edge
      {
        x: 20, y: 10, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 10 }, { x: 92, y: 10 },
        ],
      },
      // Scout sweeping south edge
      {
        x: 75, y: 90, facing: Math.PI, groupId: 1,
        patrolPath: [
          { x: 92, y: 90 }, { x: 5, y: 90 },
        ],
      },
      // Standard guard — west half diagonal
      {
        x: 38, y: 30, facing: 0, groupId: 0,
        patrolPath: [
          { x: 5, y: 30 }, { x: 38, y: 30 },
          { x: 38, y: 70 }, { x: 5, y: 70 },
        ],
      },
      // Guardian covering centre-east — wide FOV
      {
        x: 72, y: 36, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 62, y: 20 }, { x: 92, y: 20 },
          { x: 92, y: 50 }, { x: 62, y: 50 },
        ],
      },
      // Guardian covering centre-east lower — wide FOV
      {
        x: 72, y: 64, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 62, y: 50 }, { x: 92, y: 50 },
          { x: 92, y: 80 }, { x: 62, y: 80 },
        ],
      },
    ],
  },

  // ── STAGE 10: Command Bunker (mixed indoor/outdoor, hardest) ──────────────
  // (difficulty: ★★★★★)
  bunker: {
    id:          'bunker',
    name:        'Command Bunker',
    indoor:      false,
    description: 'Final infiltration — cross the defended outer yard, breach the bunker, activate three terminals and escape. Maximum security. Proceed with extreme caution.',
    floorColor:      '#080a0c',
    wallColor:       '#141820',
    shadowZoneColor: 'rgba(0,8,20,0.60)',
    lightZoneColor:  'rgba(200,220,255,0.15)',

    playerSpawn:  { x: 5,  y: 50 },
    escapePoints: [{ x: 92, y: 50 }],

    objectives: [
      { id: 'term_a', type: 'switch', pos: { x: 68, y: 20 }, label: 'Terminal A', radius: 2 },
      { id: 'term_b', type: 'switch', pos: { x: 68, y: 50 }, label: 'Terminal B', radius: 2 },
      { id: 'term_c', type: 'switch', pos: { x: 68, y: 80 }, label: 'Terminal C', radius: 2 },
    ],

    walls: [
      // Outer perimeter
      { x: 0,  y: 0,  w: 100, h: 3   },
      { x: 0,  y: 97, w: 100, h: 3   },
      { x: 0,  y: 0,  w: 3,   h: 100 },
      { x: 97, y: 0,  w: 3,   h: 100 },
      // Outer fence across the yard (door gap y = 44–56)
      { x: 30, y: 3,  w: 3,   h: 41  },
      { x: 30, y: 56, w: 3,   h: 41  },
      // Bunker outer wall (door gap y = 44–56)
      { x: 55, y: 3,  w: 3,   h: 41  },
      { x: 55, y: 56, w: 3,   h: 41  },
      // Bunker inner partition — three terminal cells (each has door gap)
      { x: 58, y: 3,  w: 36,  h: 3   },
      { x: 58, y: 37, w: 36,  h: 3   },
      { x: 58, y: 63, w: 36,  h: 3   },
      { x: 58, y: 97, w: 36,  h: 3   },
      // Cell left walls (door gap towards corridor at x = 58)
      { x: 58, y: 6,  w: 3,   h: 31  },
      { x: 58, y: 40, w: 3,   h: 23  },
      { x: 58, y: 66, w: 3,   h: 31  },
      // Yard partial barrier
      { x: 14, y: 32, w: 3,   h: 32  },
    ],

    props: [
      // Outer yard cover
      { x: 8,  y: 14, w: 6, h: 6,  type: 'crate'   },
      { x: 8,  y: 80, w: 6, h: 6,  type: 'crate'   },
      { x: 20, y: 6,  w: 6, h: 6,  type: 'crate'   },
      { x: 20, y: 88, w: 6, h: 6,  type: 'crate'   },
      { x: 6,  y: 44, w: 6, h: 8,  type: 'machine' },
      // Mid-yard (between fence and bunker) cover
      { x: 34, y: 14, w: 6, h: 6,  type: 'crate'   },
      { x: 34, y: 80, w: 6, h: 6,  type: 'crate'   },
      { x: 42, y: 44, w: 6, h: 8,  type: 'machine' },
      // Bunker interior equipment
      { x: 62, y: 8,  w: 5, h: 5,  type: 'machine' },
      { x: 78, y: 8,  w: 5, h: 5,  type: 'machine' },
      { x: 62, y: 42, w: 5, h: 5,  type: 'desk'    },
      { x: 78, y: 42, w: 5, h: 5,  type: 'desk'    },
      { x: 62, y: 68, w: 5, h: 5,  type: 'machine' },
      { x: 78, y: 68, w: 5, h: 5,  type: 'machine' },
    ],

    shadowZones: [
      // Yard corners and behind barriers
      { x: 3,  y: 3,  w: 25, h: 28 },
      { x: 3,  y: 68, w: 25, h: 28 },
      { x: 12, y: 30, w: 5,  h: 36 },
      { x: 33, y: 3,  w: 20, h: 28 },
      { x: 33, y: 68, w: 20, h: 28 },
      // Bunker terminal cell corners
      { x: 61, y: 6,  w: 36, h: 12 },
      { x: 61, y: 28, w: 36, h: 8  },
      { x: 61, y: 40, w: 36, h: 8  },
      { x: 61, y: 54, w: 36, h: 8  },
      { x: 61, y: 68, w: 36, h: 12 },
      { x: 61, y: 84, w: 36, h: 12 },
    ],

    lightZones: [
      // Floodlights at the fence line
      { x: 28, y: 38, w: 6,  h: 22 },
      // Strong lights in bunker corridor
      { x: 55, y: 40, w: 8,  h: 18 },
      // Terminal cell overhead lights
      { x: 62, y: 14, w: 32, h: 16 },
      { x: 62, y: 42, w: 32, h: 16 },
      { x: 62, y: 68, w: 32, h: 14 },
      // Outer perimeter lights on patrol zones
      { x: 3,  y: 3,  w: 25, h: 14 },
      { x: 3,  y: 82, w: 25, h: 14 },
    ],

    watcherSpawns: [
      // Scout patrolling outer yard — top
      {
        x: 15, y: 10, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 5 }, { x: 28, y: 5 },
          { x: 28, y: 30 }, { x: 5, y: 30 },
        ],
      },
      // Scout patrolling outer yard — bottom
      {
        x: 15, y: 88, facing: 0, groupId: 1,
        patrolPath: [
          { x: 5, y: 70 }, { x: 28, y: 70 },
          { x: 28, y: 95 }, { x: 5, y: 95 },
        ],
      },
      // Standard guard — mid yard
      {
        x: 42, y: 50, facing: 0, groupId: 0,
        patrolPath: [
          { x: 33, y: 30 }, { x: 52, y: 30 },
          { x: 52, y: 70 }, { x: 33, y: 70 },
        ],
      },
      // Guardian blocking bunker entrance — wide FOV
      {
        x: 60, y: 50, facing: Math.PI, groupId: 2,
        patrolPath: [
          { x: 56, y: 44 }, { x: 56, y: 56 },
        ],
      },
      // Standard guard patrolling bunker corridor
      {
        x: 75, y: 35, facing: Math.PI / 2, groupId: 0,
        patrolPath: [
          { x: 63, y: 5  }, { x: 93, y: 5  },
          { x: 93, y: 35 }, { x: 63, y: 35 },
        ],
      },
      // Guardian in lower bunker — wide FOV
      {
        x: 75, y: 72, facing: -Math.PI / 2, groupId: 2,
        patrolPath: [
          { x: 63, y: 65 }, { x: 93, y: 65 },
          { x: 93, y: 95 }, { x: 63, y: 95 },
        ],
      },
    ],
  },

};

export const STAGE_ORDER = [
  'corridor', 'rooms', 'courtyard', 'compound',
  'server_room', 'rooftop', 'warehouse', 'tunnel', 'plaza', 'bunker',
];

/**
 * Return the stage definition for the given id, falling back to 'corridor'.
 * @param {string} id
 * @returns {object}
 */
export function getStage(id) {
  return STAGES[id] || STAGES.corridor;
}
