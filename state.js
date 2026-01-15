// Unit types with their dice face values
export const UnitTypes = {
    // Base units
    ARCHERS: { id: 1, name: 'Archers', symbol: '🏹' },
    CANNON: { id: 2, name: 'Cannon', symbol: '🚀' },
    MOUNTED: { id: 3, name: 'Mounted', symbol: '🐴' },
    ASSAULT_BEASTS: { id: 4, name: 'Assault Beasts', symbol: '🐘' },
    SPEARS: { id: 5, name: 'Spears', symbol: '⚔️' },
    JESTERS: { id: 6, name: 'Jesters', symbol: '🤡' },
    
    // Alternate units
    MUSKETS: { id: 7, name: 'Muskets', symbol: '🔫' },
    AERIAL: { id: 8, name: 'Aerial', symbol: '🦅' },
    COMMANDER: { id: 9, name: 'Commander', symbol: '👑' },
    MILITIA: { id: 10, name: 'Militia', symbol: '🗽' },
    BATTERY_RAM: { id: 11, name: 'Battery Ram', symbol: '🐏' }
};

// Color palettes for unit identity
const UNIT_COLORS_COOL = ['#60a5fa', '#38bdf8', '#a78bfa', '#818cf8', '#2dd4bf', '#6366f1'];
const UNIT_COLORS_WARM = ['#fb923c', '#f87171', '#fbbf24', '#facc15', '#fb7185', '#fdba74'];
let unitColorIndex = { 1: 0, 2: 0 };
let unitTypeCounters = { 1: {}, 2: {} }; // Track count per type per faction

// Game phases
export const GamePhase = {
    SETUP: 'setup',
    FACTION_1: 'faction_1',
    FACTION_2: 'faction_2',
    ABILITY_TARGETING: 'ability_targeting', // New phase for selecting ability targets
    RESOLUTION_COMBAT: 'resolution_combat',
    RESOLUTION_MELEE: 'resolution_melee',
    RESOLUTION_RANGED: 'resolution_ranged',
    RESOLUTION_CASTLE: 'resolution_castle',
    GAME_OVER: 'game_over'
};

// Create a new unit
export function createUnit(type, faction, row, col) {
    // Assign unique color for this faction
    const colorPalette = faction === 1 ? UNIT_COLORS_COOL : UNIT_COLORS_WARM;
    const color = colorPalette[unitColorIndex[faction] % colorPalette.length];
    unitColorIndex[faction]++;
    
    // Assign unit number based on type count
    if (!unitTypeCounters[faction][type.id]) {
        unitTypeCounters[faction][type.id] = 0;
    }
    unitTypeCounters[faction][type.id]++;
    const unitNumber = unitTypeCounters[faction][type.id];
    
    return {
        id: crypto.randomUUID(),
        type,
        faction, // 1 or 2
        row,
        col,
        damage: 0,
        maxHp: 5,
        movedThisTurn: false,
        lastTarget: null, // For Archers' Volley penalty
        color, // Unique color for identity
        number: unitNumber // Unique number per type
    };
}

// Get display name for a unit (includes number if multiple of same type)
export function getUnitDisplayName(state, unit) {
    // Count how many units of this type exist in this faction
    const sameTypeUnits = state.units.filter(u => 
        u.faction === unit.faction && 
        u.type.id === unit.type.id
    );
    
    if (sameTypeUnits.length > 1) {
        return `${unit.type.symbol} ${unit.type.name} #${unit.number}`;
    } else {
        return `${unit.type.symbol} ${unit.type.name}`;
    }
}

// Create initial game state
export function createGameState() {
    return {
        phase: GamePhase.SETUP,
        currentPlayer: 1,
        round: 1,
        units: [],
        destroyedUnits: { 1: [], 2: [] }, // Track destroyed units by faction
        castleDamage: { 1: 0, 2: 0 },
        previousCastleDamage: { 1: 0, 2: 0 }, // For 2-consecutive-rounds check
        consecutiveDamageRounds: { 1: 0, 2: 0 },
        castleDamageAnimation: { 1: null, 2: null }, // Track castle damage animations
        batteryRamWin: null, // Track Battery Ram instant win
        selectedUnit: null,
        validMoves: [],
        activatedUnits: new Set(), // Units that have moved this phase
        pendingSecondMove: null, // Mounted unit awaiting second move
        abilityTargeting: null, // Ability targeting state (set during ABILITY_TARGETING phase)
        commanderTarget: null, // COMMANDER Forward! ability target unit
        unitsInCombatThisTurn: new Set(), // Track units that participated in combat this resolution phase
        log: []
    };
}

// Get units at a specific hex
export function getUnitsAt(state, row, col) {
    return state.units.filter(u => u.row === row && u.col === col && u.damage < u.maxHp);
}

// Get units at hex for a specific faction
export function getFactionUnitsAt(state, row, col, faction) {
    return getUnitsAt(state, row, col).filter(u => u.faction === faction);
}

// Check if a unit is engaged (same hex as enemy)
export function isEngaged(state, unit) {
    const enemyFaction = unit.faction === 1 ? 2 : 1;
    return getFactionUnitsAt(state, unit.row, unit.col, enemyFaction).length > 0;
}

// Check if unit is alive
export function isAlive(unit) {
    return unit.damage < unit.maxHp;
}

// Get hex distance
export function hexDistance(r1, c1, r2, c2) {
    // Offset coordinates to cube coordinates for accurate distance
    // Using column-offset (flat-top hexes, odd columns offset down)
    const toCube = (row, col) => {
        const x = col;
        const z = row - Math.floor(col / 2);
        const y = -x - z;
        return { x, y, z };
    };
    const a = toCube(r1, c1);
    const b = toCube(r2, c2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

// Get adjacent hexes
// Using flat-top hex grid with column-offset (odd columns are offset down)
export function getAdjacentHexes(row, col) {
    const isOddCol = col % 2 === 1;
    const offsets = isOddCol
        ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]]
        : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
    
    return offsets
        .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
        .filter(({ row: r, col: c }) => r >= 0 && r < 6 && c >= 0 && c < 6);
}

// Check if hex is valid board position
export function isValidHex(row, col) {
    return row >= 0 && row < 6 && col >= 0 && col < 6;
}

// Get castle row for a faction
export function getCastleRow(faction) {
    return faction === 1 ? 5 : 0;
}

// Check if position is in enemy castle
export function isInEnemyCastle(unit) {
    const enemyCastleRow = getCastleRow(unit.faction === 1 ? 2 : 1);
    return unit.row === enemyCastleRow;
}

// Apply damage to a unit
export function applyDamage(state, unit, amount, sourceInfo = null) {
    unit.damage += amount;
    const unitName = getUnitDisplayName(state, unit);
    
    // Only log if no source info provided (combat/direct damage)
    // If source info provided, the ability function will log the full message
    if (!sourceInfo) {
        state.log.push(`${unitName} takes ${amount} damage (${unit.damage}/${unit.maxHp})`);
    }
    
    // Add enhanced hit animation (1 second with red tint)
    unit.hitAnimation = { 
        startTime: Date.now(), 
        duration: 1000 
    };
    
    if (unit.damage >= unit.maxHp) {
        state.log.push(`${unitName} is destroyed!`);
    }
}

// Remove dead units from the board
export function removeDeadUnits(state) {
    const deadUnits = state.units.filter(u => !isAlive(u));
    
    // Add dead units to destroyed list and start fade animation
    for (const unit of deadUnits) {
        const enemyFaction = unit.faction === 1 ? 2 : 1;
        state.destroyedUnits[enemyFaction].push(unit);
        
        // Add enhanced destroy animation (fade + scale + rotate)
        unit.destroyAnimation = {
            startTime: Date.now(),
            duration: 1500
        };
    }
    
    // Remove units after animation completes
    // For now, remove immediately (animation will be handled in renderer)
    state.units = state.units.filter(isAlive);
}

// Calculate castle damage from unengaged units in enemy castle rows
export function calculateCastleDamage(state) {
    // Check each faction's units
    for (const faction of [1, 2]) {
        const enemyFaction = faction === 1 ? 2 : 1;
        const enemyCastleRow = getCastleRow(enemyFaction);
        
        // Find units in enemy castle row
        const unitsInCastle = state.units.filter(u => 
            u.faction === faction && 
            u.row === enemyCastleRow &&
            isAlive(u)
        );
        
        // Battery Ram: Crash Through - instant win if unengaged in enemy castle
        for (const unit of unitsInCastle) {
            if (unit.type.id === UnitTypes.BATTERY_RAM.id && !isEngaged(state, unit)) {
                state.batteryRamWin = faction;
                logMessage(state, `Battery Ram crashes through! Player ${faction} wins!`);
                return;
            }
        }
        
        // Count unengaged units for castle damage
        let castleDamageDealt = 0;
        for (const unit of unitsInCastle) {
            if (!isEngaged(state, unit)) {
                castleDamageDealt += 1;
            }
        }
        
        if (castleDamageDealt > 0) {
            state.castleDamage[enemyFaction] += castleDamageDealt;
            logMessage(state, `Player ${faction} deals ${castleDamageDealt} damage to enemy castle!`);
            
            // Trigger castle damage animation (sidebar)
            if (typeof window !== 'undefined' && window.triggerCastleDamageAnimation) {
                window.triggerCastleDamageAnimation(enemyFaction);
            }
            
            // Set castle tile animation (similar to unit hit animation)
            state.castleDamageAnimation[enemyFaction] = {
                startTime: Date.now(),
                duration: 1000
            };
        }
    }
}

// Check win conditions at end of round
export function checkWinCondition(state) {
    // Battery Ram instant win
    if (state.batteryRamWin) {
        return { winner: state.batteryRamWin, reason: 'Battery Ram crashed through enemy castle!' };
    }
    
    const diff = state.castleDamage[1] - state.castleDamage[2];
    
    // 2+ damage difference = immediate loss
    if (diff >= 2) {
        return { winner: 2, reason: 'Player 1 castle took 2+ more damage' };
    }
    if (diff <= -2) {
        return { winner: 1, reason: 'Player 2 castle took 2+ more damage' };
    }
    
    // Track consecutive rounds with 1 damage difference
    if (diff === 1) {
        state.consecutiveDamageRounds[1]++;
        state.consecutiveDamageRounds[2] = 0;
    } else if (diff === -1) {
        state.consecutiveDamageRounds[2]++;
        state.consecutiveDamageRounds[1] = 0;
    } else {
        state.consecutiveDamageRounds[1] = 0;
        state.consecutiveDamageRounds[2] = 0;
    }
    
    if (state.consecutiveDamageRounds[1] >= 2) {
        return { winner: 2, reason: 'Player 1 had more damage for 2 consecutive rounds' };
    }
    if (state.consecutiveDamageRounds[2] >= 2) {
        return { winner: 1, reason: 'Player 2 had more damage for 2 consecutive rounds' };
    }
    
    return null;
}

// Log a message
export function logMessage(state, message) {
    state.log.push(message);
    console.log(message);
}

// Get engaged groups by hex (for damage distribution)
export function getEngagedGroups(state) {
    const groups = [];
    const processedHexes = new Set();
    
    for (const unit of state.units) {
        if (!isAlive(unit)) continue;
        
        const hexKey = `${unit.row},${unit.col}`;
        if (processedHexes.has(hexKey)) continue;
        
        // Get all units at this hex
        const faction1Units = getFactionUnitsAt(state, unit.row, unit.col, 1);
        const faction2Units = getFactionUnitsAt(state, unit.row, unit.col, 2);
        
        // Only create a group if both factions present (engaged)
        if (faction1Units.length > 0 && faction2Units.length > 0) {
            groups.push({
                hex: { row: unit.row, col: unit.col },
                faction1: faction1Units,
                faction2: faction2Units
            });
            processedHexes.add(hexKey);
        }
    }
    
    return groups;
}

// Async combat resolution with damage allocation (for future use)
export async function resolveCombatAsync(state, showAllocationModal) {
    const groups = getEngagedGroups(state);
    
    if (groups.length === 0) {
        logMessage(state, 'No combats to resolve');
        return;
    }
    
    logMessage(state, `Resolving ${groups.length} engagement(s)...`);
    
    // Process each engaged hex
    for (const group of groups) {
        // Mark all units in this combat as having participated
        group.faction1.forEach(u => state.unitsInCombatThisTurn.add(u.id));
        group.faction2.forEach(u => state.unitsInCombatThisTurn.add(u.id));
        
        // Process faction 1's damage to faction 2
        if (group.faction1.length > 0 && group.faction2.length > 0) {
            const totalDamage1 = group.faction1.reduce((sum, u) => 
                sum + (u.type.id === UnitTypes.MILITIA.id ? 3 : 2), 0);
            
            if (group.faction2.length === 1) {
                // Only one enemy, apply all damage
                applyDamage(state, group.faction2[0], totalDamage1);
            } else if (showAllocationModal) {
                // Multiple enemies, show allocation modal (faction 1 is attacking)
                const allocation = await showAllocationModal(group.faction2, totalDamage1, 1);
                for (const [enemyId, damage] of allocation) {
                    const enemy = group.faction2.find(u => u.id === enemyId);
                    if (enemy && damage > 0) {
                        applyDamage(state, enemy, damage);
                    }
                }
            } else {
                // Fallback: distribute evenly
                const damagePerEnemy = Math.floor(totalDamage1 / group.faction2.length);
                const remainder = totalDamage1 % group.faction2.length;
                group.faction2.forEach((enemy, idx) => {
                    const damage = damagePerEnemy + (idx < remainder ? 1 : 0);
                    applyDamage(state, enemy, damage);
                });
            }
        }
        
        // Process faction 2's damage to faction 1
        if (group.faction2.length > 0 && group.faction1.length > 0) {
            const totalDamage2 = group.faction2.reduce((sum, u) => 
                sum + (u.type.id === UnitTypes.MILITIA.id ? 3 : 2), 0);
            
            if (group.faction1.length === 1) {
                // Only one enemy, apply all damage
                applyDamage(state, group.faction1[0], totalDamage2);
            } else if (showAllocationModal) {
                // Multiple enemies, show allocation modal (faction 2 is attacking)
                const allocation = await showAllocationModal(group.faction1, totalDamage2, 2);
                for (const [enemyId, damage] of allocation) {
                    const enemy = group.faction1.find(u => u.id === enemyId);
                    if (enemy && damage > 0) {
                        applyDamage(state, enemy, damage);
                    }
                }
            } else {
                // Fallback: distribute evenly
                const damagePerEnemy = Math.floor(totalDamage2 / group.faction1.length);
                const remainder = totalDamage2 % group.faction1.length;
                group.faction1.forEach((enemy, idx) => {
                    const damage = damagePerEnemy + (idx < remainder ? 1 : 0);
                    applyDamage(state, enemy, damage);
                });
            }
        }
    }
    
    // Remove dead units
    removeDeadUnits(state);
}

// Allow customizable damage allocation
export function allocateCombatDamage(state, unit1, unit2, damage1to2) {
    const damage2to1 = 2 - damage1to2;
    
    if (damage2to1 > 0) applyDamage(state, unit1, damage2to1);
    if (damage1to2 > 0) applyDamage(state, unit2, damage1to2);
}

// Unit Abilities

// Archers: Volley ability
export function getArchersVolleyTargets(state, unit) {
    if (unit.type.id !== UnitTypes.ARCHERS.id) return [];
    
    const targets = [];
    const maxRange = 2;
    
    for (const enemy of state.units) {
        if (!isAlive(enemy) || enemy.faction === unit.faction) continue;
        
        const distance = hexDistance(unit.row, unit.col, enemy.row, enemy.col);
        if (distance > 0 && distance <= maxRange) {
            targets.push(enemy);
        }
    }
    
    return targets;
}

// Calculate Archers volley damage
export function calculateArchersVolleyDamage(unit, target) {
    let damage = 2; // Base damage
    
    if (unit.movedThisTurn) {
        damage -= 1; // -1 if moved
    }
    
    if (unit.lastTarget && unit.lastTarget !== target.id) {
        damage -= 1; // -1 if new target
    }
    
    return Math.max(0, damage);
}

// Cannon: Mortar Fire ability
export function getCannonMortarTargets(state, unit) {
    if (unit.type.id !== UnitTypes.CANNON.id) return [];
    
    // Cannon can only fire if it didn't move
    if (unit.movedThisTurn) return [];
    
    const targets = [];
    const maxRange = 2;
    
    for (const enemy of state.units) {
        if (!isAlive(enemy) || enemy.faction === unit.faction) continue;
        
        const distance = hexDistance(unit.row, unit.col, enemy.row, enemy.col);
        if (distance > 0 && distance <= maxRange) {
            targets.push(enemy);
        }
    }
    
    return targets;
}

// Calculate Cannon mortar damage
export function calculateCannonMortarDamage(unit) {
    // If cannon didn't move, deal 1 damage
    return unit.movedThisTurn ? 0 : 1;
}

// Muskets: Fire! ability
export function getMusketsFireTargets(state, unit) {
    if (unit.type.id !== UnitTypes.MUSKETS.id) return [];
    
    // Muskets can only fire if they didn't move
    if (unit.movedThisTurn) return [];
    
    const targets = [];
    
    // Find all enemy units in the same column
    for (const enemy of state.units) {
        if (!isAlive(enemy) || enemy.faction === unit.faction) continue;
        
        if (enemy.col === unit.col) {
            targets.push(enemy);
        }
    }
    
    return targets;
}

// Calculate Muskets fire damage
export function calculateMusketsFireDamage(unit) {
    // If muskets didn't move, deal 1 damage
    return unit.movedThisTurn ? 0 : 1;
}

// Mounted: Charge ability
export function canMountedCharge(unit, distance) {
    if (unit.type.id !== UnitTypes.MOUNTED.id) return false;
    return distance <= 2;
}

// Apply mounted charge bonus damage
export function applyMountedChargeBonus(state, unit, target, distanceMoved) {
    if (unit.type.id !== UnitTypes.MOUNTED.id) return;
    
    if (distanceMoved === 2) {
        // Deal 2 bonus damage
        const targetName = getUnitDisplayName(state, target);
        const unitName = getUnitDisplayName(state, unit);
        applyDamage(state, target, 2, 'ability');
        const newHP = target.maxHp - target.damage;
        logMessage(state, `${unitName} Charge: ${targetName} takes 2 damage (${newHP}/${target.maxHp}) at [${target.row}, ${target.col}]`);
    }
}

// Spears: Pierce ability
export function getSpearsPierceTargets(state, unit) {
    if (unit.type.id !== UnitTypes.SPEARS.id) return [];
    
    const targets = [];
    
    // Pierce at Range 1
    for (const enemy of state.units) {
        if (!isAlive(enemy) || enemy.faction === unit.faction) continue;
        
        const distance = hexDistance(unit.row, unit.col, enemy.row, enemy.col);
        if (distance === 1) {
            targets.push(enemy);
        }
    }
    
    return targets;
}

// Calculate Spears pierce damage
export function calculateSpearsPierceDamage(unit, target) {
    return 1; // Base damage 1
}

// Spears: Counter Charge ability
export function applySpearCounterCharge(state, unit, attacker) {
    if (unit.type.id !== UnitTypes.SPEARS.id) return;
    if (attacker.type.id !== UnitTypes.MOUNTED.id) return;
    
    // Negate mounted charge damage and deal 3 damage instead
    const attackerName = getUnitDisplayName(state, attacker);
    const unitName = getUnitDisplayName(state, unit);
    applyDamage(state, attacker, 3, 'ability');
    const newHP = attacker.maxHp - attacker.damage;
    logMessage(state, `${unitName} Counter Charge: ${attackerName} takes 3 damage (${newHP}/${attacker.maxHp}) at [${attacker.row}, ${attacker.col}]`);
}

// Jesters: Taunt ability
export function getJestersTauntTargets(state, unit) {
    if (unit.type.id !== UnitTypes.JESTERS.id) return [];
    
    const targets = [];
    
    // Taunt enemies in Range 1
    for (const enemy of state.units) {
        if (!isAlive(enemy) || enemy.faction === unit.faction) continue;
        
        const distance = hexDistance(unit.row, unit.col, enemy.row, enemy.col);
        if (distance === 1) {
            targets.push(enemy);
        }
    }
    
    return targets;
}

// Apply Jesters taunt (move enemy to jester's hex)
export function applyJestersTaunt(state, unit, target) {
    if (unit.type.id !== UnitTypes.JESTERS.id) return;
    
    const oldRow = target.row;
    const oldCol = target.col;
    
    // Move target to jester's hex
    target.row = unit.row;
    target.col = unit.col;
    
    logMessage(state, `${unit.type.symbol} ${unit.type.name} Taunt forces ${target.type.symbol} ${target.type.name} to move to (${unit.row}, ${unit.col})`);
}

// Random Setup Mode

// Generate random unit placement for a faction
export function generateRandomPlacement(faction, existingUnits = []) {
    const units = [];
    const castleRow = getCastleRow(faction);
    const castleRows = faction === 1 ? [4, 5] : [0, 1]; // Two rows for placement
    
    // Get available unit types
    const unitTypesList = Object.values(UnitTypes);
    
    // Shuffle and pick 6 units
    const shuffled = [...unitTypesList].sort(() => Math.random() - 0.5);
    const selectedTypes = shuffled.slice(0, 6);
    
    // Place units randomly on castle rows
    const occupiedHexes = new Set();
    existingUnits.forEach(u => {
        if (u.faction === faction) {
            occupiedHexes.add(`${u.row},${u.col}`);
        }
    });
    
    for (const unitType of selectedTypes) {
        let placed = false;
        let attempts = 0;
        
        while (!placed && attempts < 20) {
            const row = castleRows[Math.floor(Math.random() * castleRows.length)];
            const col = Math.floor(Math.random() * 6);
            const key = `${row},${col}`;
            
            if (!occupiedHexes.has(key)) {
                const unit = createUnit(unitType, faction, row, col);
                units.push(unit);
                occupiedHexes.add(key);
                placed = true;
            }
            
            attempts++;
        }
        
        // If failed to place after attempts, place anyway
        if (!placed) {
            const row = castleRows[0];
            const col = Math.floor(Math.random() * 6);
            const unit = createUnit(unitType, faction, row, col);
            units.push(unit);
        }
    }
    
    return units;
}

// Check if placement is valid (no more than 2 units per hex per faction)
export function isValidPlacement(units) {
    const hexCounts = new Map();
    
    for (const unit of units) {
        const key = `${unit.row},${unit.col},${unit.faction}`;
        const count = hexCounts.get(key) || 0;
        
        if (count >= 2) {
            return false;
        }
        
        hexCounts.set(key, count + 1);
    }
    
    return true;
}

// Draft Mode

// Get available units for draft (one of each type)
export function getAvailableDraftUnits() {
    const units = [];
    for (const unitType of Object.values(UnitTypes)) {
        units.push({
            type: unitType,
            selected: false
        });
    }
    return units;
}

// Resolve melee abilities (Spears Pierce)
export function resolveMeleeAbilities(state) {
    logMessage(state, 'Resolving melee abilities...');
    
    for (const unit of state.units) {
        // Skip if dead, currently engaged, or participated in combat this turn
        if (!isAlive(unit) || isEngaged(state, unit) || state.unitsInCombatThisTurn.has(unit.id)) continue;
        
        // Spears: Pierce
        if (unit.type.id === UnitTypes.SPEARS.id) {
            // Check if player selected a target
            let target = null;
            if (state.abilityTargeting && state.abilityTargeting.selections.has(unit.id)) {
                const selection = state.abilityTargeting.selections.get(unit.id);
                target = state.units.find(u => u.id === selection.unitId);
            } else {
                // Fallback to auto-targeting if no selection
                const targets = getSpearsPierceTargets(state, unit);
                if (targets.length > 0) {
                    target = targets[0];
                }
            }
            
            if (target && isAlive(target)) {
                const damage = calculateSpearsPierceDamage(unit, target);
                
                // Add ability activation animation
                unit.abilityAnimation = {
                    startTime: Date.now(),
                    duration: 800,
                    type: 'melee'
                };
                
                const targetName = getUnitDisplayName(state, target);
                const unitName = getUnitDisplayName(state, unit);
                applyDamage(state, target, damage, 'ability');
                const newHP = target.maxHp - target.damage;
                logMessage(state, `${unitName} Pierce: ${targetName} takes ${damage} damage (${newHP}/${target.maxHp}) at [${target.row}, ${target.col}]`);
            }
        }
        
        // Jesters: Taunt
        if (unit.type.id === UnitTypes.JESTERS.id) {
            // Check if player selected a target
            let target = null;
            if (state.abilityTargeting && state.abilityTargeting.selections.has(unit.id)) {
                const selection = state.abilityTargeting.selections.get(unit.id);
                target = state.units.find(u => u.id === selection.unitId);
            } else {
                // Fallback to auto-targeting if no selection
                const targets = getJestersTauntTargets(state, unit);
                if (targets.length > 0) {
                    target = targets[0];
                }
            }
            
            if (target && isAlive(target)) {
                // Add ability activation animation
                unit.abilityAnimation = {
                    startTime: Date.now(),
                    duration: 800,
                    type: 'melee'
                };
                
                applyJestersTaunt(state, unit, target);
            }
        }
    }
    
    removeDeadUnits(state);
}

// Resolve ranged abilities (Archers, Cannon)
export function resolveRangedAbilities(state) {
    logMessage(state, 'Resolving ranged abilities...');
    
    for (const unit of state.units) {
        // Skip if dead, currently engaged, or participated in combat this turn
        if (!isAlive(unit) || isEngaged(state, unit) || state.unitsInCombatThisTurn.has(unit.id)) continue;
        
        // Archers: Volley
        if (unit.type.id === UnitTypes.ARCHERS.id) {
            // Check if player selected a target
            let target = null;
            if (state.abilityTargeting && state.abilityTargeting.selections.has(unit.id)) {
                const selection = state.abilityTargeting.selections.get(unit.id);
                target = state.units.find(u => u.id === selection.unitId);
            } else {
                // Fallback to auto-targeting with last target preference
                const targets = getArchersVolleyTargets(state, unit);
                if (targets.length > 0) {
                    target = unit.lastTarget 
                        ? targets.find(t => t.id === unit.lastTarget) || targets[0]
                        : targets[0];
                }
            }
            
            if (target && isAlive(target)) {
                const damage = calculateArchersVolleyDamage(unit, target);
                if (damage > 0) {
                    // Add ability activation animation
                    unit.abilityAnimation = {
                        startTime: Date.now(),
                        duration: 800,
                        type: 'ranged'
                    };
                    
                    const targetName = getUnitDisplayName(state, target);
                    const unitName = getUnitDisplayName(state, unit);
                    applyDamage(state, target, damage, 'ability');
                    const newHP = target.maxHp - target.damage;
                    logMessage(state, `${unitName} Volley: ${targetName} takes ${damage} damage (${newHP}/${target.maxHp}) at [${target.row}, ${target.col}]`);
                    unit.lastTarget = target.id;
                }
            }
        }
        
        // Cannon: Mortar Fire
        if (unit.type.id === UnitTypes.CANNON.id) {
            // Check if player selected a target hex
            let targetHex = null;
            if (state.abilityTargeting && state.abilityTargeting.selections.has(unit.id)) {
                const selection = state.abilityTargeting.selections.get(unit.id);
                targetHex = selection.hex;
            } else {
                // Fallback to auto-targeting
                const targets = getCannonMortarTargets(state, unit);
                if (targets.length > 0) {
                    targetHex = { row: targets[0].row, col: targets[0].col };
                }
            }
            
            if (targetHex) {
                // Validate range (defense against bugs)
                const distance = hexDistance(unit.row, unit.col, targetHex.row, targetHex.col);
                if (distance > 0 && distance <= 2) {
                    const damage = calculateCannonMortarDamage(unit);
                    
                    // Add ability activation animation
                    unit.abilityAnimation = {
                        startTime: Date.now(),
                        duration: 800,
                        type: 'ranged'
                    };
                    
                    // Deal damage to all enemy units in that hex
                    const enemiesInHex = state.units.filter(u => 
                        u.row === targetHex.row && 
                        u.col === targetHex.col && 
                        u.faction !== unit.faction &&
                        isAlive(u)
                    );
                    
                    const unitName = getUnitDisplayName(state, unit);
                    for (const enemy of enemiesInHex) {
                        const enemyName = getUnitDisplayName(state, enemy);
                        applyDamage(state, enemy, damage, 'ability');
                        const newHP = enemy.maxHp - enemy.damage;
                        logMessage(state, `${unitName} Mortar: ${enemyName} takes ${damage} damage (${newHP}/${enemy.maxHp}) at [${targetHex.row}, ${targetHex.col}]`);
                    }
                }
            }
        }
        
        // Muskets: Fire!
        if (unit.type.id === UnitTypes.MUSKETS.id) {
            const targets = getMusketsFireTargets(state, unit);
            
            if (targets.length > 0) {
                const damage = calculateMusketsFireDamage(unit);
                
                if (damage > 0) {
                    // Add ability activation animation
                    unit.abilityAnimation = {
                        startTime: Date.now(),
                        duration: 800,
                        type: 'ranged'
                    };
                    
                    const unitName = getUnitDisplayName(state, unit);
                    for (const target of targets) {
                        const targetName = getUnitDisplayName(state, target);
                        applyDamage(state, target, damage, 'ability');
                        const newHP = target.maxHp - target.damage;
                        logMessage(state, `${unitName} Fire!: ${targetName} takes ${damage} damage (${newHP}/${target.maxHp}) at [${target.row}, ${target.col}]`);
                    }
                }
            }
        }
    }
    
    removeDeadUnits(state);
}
