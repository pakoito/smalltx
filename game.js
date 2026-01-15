import { HexRenderer } from './renderer.js';
import { loadRulesContent, displayRulesTab } from './rulesLoader.js';
import {
    createGameState,
    createUnit,
    UnitTypes,
    GamePhase,
    getAdjacentHexes,
    getFactionUnitsAt,
    isEngaged,
    logMessage,
    resolveCombatAsync,
    checkWinCondition,
    getArchersVolleyTargets,
    getCannonMortarTargets,
    getSpearsPierceTargets,
    getJestersTauntTargets,
    hexDistance,
    applyMountedChargeBonus,
    applySpearCounterCharge,
    calculateCastleDamage,
    resolveMeleeAbilities,
    resolveRangedAbilities,
    getUnitDisplayName} from './state.js';

// Initialize game
const canvas = document.getElementById('game-board');
const renderer = new HexRenderer(canvas);
let state = createGameState();
let setupPhase = {
    active: false,
    currentPlayer: 1,
    selectedUnits: [],
    selectedPositions: []
};
let abilityTargeting = {
    active: false,
    sourceUnit: null,
    targets: [],
    abilityType: null
};

// Animation queue for resolution phase
class AnimationQueue {
    constructor() {
        this.queue = [];
        this.isPlaying = false;
        this.onCompleteCallback = null;
    }
    
    enqueue(animation) {
        this.queue.push(animation);
    }
    
    async play() {
        if (this.isPlaying || this.queue.length === 0) return;
        
        this.isPlaying = true;
        
        while (this.queue.length > 0) {
            const animation = this.queue.shift();
            await this.playAnimation(animation);
        }
        
        this.isPlaying = false;
        
        if (this.onCompleteCallback) {
            this.onCompleteCallback();
            this.onCompleteCallback = null;
        }
    }
    
    playAnimation(animation) {
        return new Promise((resolve) => {
            animation.start();
            setTimeout(() => {
                if (animation.onComplete) {
                    animation.onComplete();
                }
                resolve();
            }, animation.duration || 1000);
        });
    }
    
    onComplete(callback) {
        this.onCompleteCallback = callback;
    }
    
    clear() {
        this.queue = [];
        this.isPlaying = false;
        this.onCompleteCallback = null;
    }
}

const animationQueue = new AnimationQueue();

// For milestone 1: create a demo setup with units
function setupDemoGame() {
    state = createGameState();
    state.phase = GamePhase.FACTION_1;
    
    logMessage(state, '⚔️ Welcome to SmallTricks! A balanced demo battle awaits.');
    
    // Player 1 (bottom, blue) - recommended first game setup
    state.units.push(createUnit(UnitTypes.MOUNTED, 1, 3, 0));
    state.units.push(createUnit(UnitTypes.SPEARS, 1, 3, 2));
    state.units.push(createUnit(UnitTypes.ARCHERS, 1, 4, 2));
    state.units.push(createUnit(UnitTypes.ARCHERS, 1, 4, 3));
    state.units.push(createUnit(UnitTypes.SPEARS, 1, 3, 3));
    state.units.push(createUnit(UnitTypes.MOUNTED, 1, 3, 5));
    
    // Player 2 (top, green) - recommended first game setup
    state.units.push(createUnit(UnitTypes.CANNON, 2, 1, 1));
    state.units.push(createUnit(UnitTypes.ASSAULT_BEASTS, 2, 2, 1));
    state.units.push(createUnit(UnitTypes.SPEARS, 2, 1, 2));
    state.units.push(createUnit(UnitTypes.MOUNTED, 2, 2, 5));
    state.units.push(createUnit(UnitTypes.ASSAULT_BEASTS, 2, 2, 3));
    state.units.push(createUnit(UnitTypes.CANNON, 2, 1, 4));
    
    updateUI();
    render();
}

// Start the faction setup UI
function startFactionSetup() {
    setupPhase.active = true;
    setupPhase.currentPlayer = 1;
    setupPhase.selectedUnits = [];
    setupPhase.selectedPositions = [];
    
    state = createGameState();
    state.phase = GamePhase.SETUP;
    
    showSetupUI();
    updateUI();
}

// Get valid moves for a unit
function getValidMoves(unit) {
    if (isEngaged(state, unit)) {
        // Engaged units can't move, except Assault Beasts (Trample)
        if (unit.type.id !== UnitTypes.ASSAULT_BEASTS.id) {
            return [];
        }
    }
    
    // Special case: COMMANDER shows friendly units in Range 2 (Forward! ability)
    if (unit.type.id === UnitTypes.COMMANDER.id) {
        const targetHexes = [];
        const seenHexes = new Set();
        
        // Find all friendly units in Range 2 (excluding self)
        for (const friendlyUnit of state.units) {
            if (friendlyUnit.id === unit.id) continue; // Skip self
            if (friendlyUnit.faction !== unit.faction) continue; // Skip enemies
            if (friendlyUnit.damage >= friendlyUnit.maxHp) continue; // Skip dead
            
            const distance = hexDistance(unit.row, unit.col, friendlyUnit.row, friendlyUnit.col);
            if (distance > 0 && distance <= 2) {
                const hexKey = `${friendlyUnit.row},${friendlyUnit.col}`;
                if (!seenHexes.has(hexKey)) {
                    seenHexes.add(hexKey);
                    targetHexes.push({ row: friendlyUnit.row, col: friendlyUnit.col });
                }
            }
        }
        
        return targetHexes;
    }
    
    // Special case: AERIAL can move to any empty hex (except enemy castle)
    if (unit.type.id === UnitTypes.AERIAL.id) {
        const moves = [];
        const enemyCastleRow = unit.faction === 1 ? 0 : 5;
        
        // Check all hexes on the board
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                // Skip current position
                if (row === unit.row && col === unit.col) continue;
                
                // Skip enemy castle hexes
                if (row === enemyCastleRow) continue;
                
                // Check if hex is empty (no units at all)
                const unitsAtHex = state.units.filter(u => 
                    u.row === row && u.col === col && u.damage < u.maxHp
                );
                
                if (unitsAtHex.length === 0) {
                    moves.push({ row, col });
                }
            }
        }
        
        return moves;
    }
    
    // Determine movement range based on unit type
    let maxMovement = 1; // Default: 1 hex (adjacent)
    
    // Mounted units: split into two 1-hex moves for charge bonus clarity
    // First move is 1 hex, if they move again, it's another 1 hex (total reach of 2)
    if (unit.type.id === UnitTypes.MOUNTED.id) {
        if (unit.movedThisTurn) {
            // Second move: only 1 hex from current position
            maxMovement = 1;
        } else {
            // First move: can move up to 1 hex from current position
            // (we enforce the "two separate 1-hex moves" by allowing 1 hex at a time)
            maxMovement = 1;
        }
    }
    
    const moves = [];
    const visited = new Set();
    const queue = [{ hex: { row: unit.row, col: unit.col }, distance: 0 }];
    
    while (queue.length > 0) {
        const current = queue.shift();
        const { hex, distance } = current;
        const key = `${hex.row},${hex.col}`;
        
        if (visited.has(key) || distance > maxMovement) continue;
        visited.add(key);
        
        // Add this hex as a valid move
        if (distance > 0) { // Don't include starting position in BFS
            const friendlyUnits = getFactionUnitsAt(state, hex.row, hex.col, unit.faction);
            if (friendlyUnits.length < 2) {
                moves.push(hex);
            }
        }
        
        // Explore adjacent hexes if we haven't reached max distance
        if (distance < maxMovement) {
            const adjacent = getAdjacentHexes(hex.row, hex.col);
            for (const nextHex of adjacent) {
                const nextKey = `${nextHex.row},${nextHex.col}`;
                if (!visited.has(nextKey)) {
                    queue.push({ hex: nextHex, distance: distance + 1 });
                }
            }
        }
    }
    
    // Can also stay in place
    moves.push({ row: unit.row, col: unit.col });
    
    return moves;
}

// Handle click on board
// Handle unit placement during setup - select/move existing units
function handlePlacementClick(hex) {
    const placementPhase = state.placementPhase;
    if (!placementPhase) return;
    
    const { currentPlayer, placedUnits } = placementPhase;
    const validRows = currentPlayer === 1 ? [3, 4, 5] : [0, 1, 2];
    
    // Check if clicking on an existing unit to select/deselect it
    const clickedUnit = state.units.find(u => 
        u.row === hex.row && 
        u.col === hex.col && 
        u.faction === currentPlayer &&
        placedUnits.includes(u)
    );
    
    if (clickedUnit) {
        // Toggle selection
        if (placementPhase.selectedUnit === clickedUnit) {
            placementPhase.selectedUnit = null;
        } else {
            placementPhase.selectedUnit = clickedUnit;
        }
        updateUI();
        render();
        return;
    }
    
    // If a unit is selected, move it
    if (placementPhase.selectedUnit) {
        const unitToMove = placementPhase.selectedUnit;
        
        // Validate target hex is in valid placement rows
        if (!validRows.includes(hex.row)) {
            return;
        }
        
        // Check if target hex already has 2 units (excluding the one being moved)
        const unitsAtHex = state.units.filter(u => 
            u.row === hex.row && 
            u.col === hex.col &&
            u !== unitToMove
        );
        if (unitsAtHex.length >= 2) {
            return;
        }
        
        // Move the unit
        unitToMove.row = hex.row;
        unitToMove.col = hex.col;
        placementPhase.selectedUnit = null;
        
        updateUI();
        render();
        return;
    }
    
    // Click on empty hex with no unit selected - do nothing
    updateUI();
    render();
}

// Confirm placement and move to next phase
function confirmPlacement() {
    if (!state.placementPhase) return;
    
    const { currentPlayer } = state.placementPhase;
    
    if (currentPlayer === 1) {
        // Start Player 2 placement
        state.placementPhase = {
            currentPlayer: 2,
            placedUnits: [],
            selectedUnit: null
        };
        
        // Place all units for Player 2 in default positions (row 0-2, spreading across columns)
        const p2Units = state.draftSelected[2];
        for (let i = 0; i < p2Units.length; i++) {
            const unitType = p2Units[i];
            const row = 2 - Math.floor(i / 3); // Distribute across rows 2-0 (reverse for P2)
            const col = i % 3; // Distribute across cols 0-2
            const unit = createUnit(unitType, 2, row, col);
            state.units.push(unit);
            state.placementPhase.placedUnits.push(unit);
        }
        
        showPhaseTransition('Player 2 - Place Units');
        logMessage(state, 'Player 2 - Click units to reposition them on rows 0-2. Press Confirm when ready.');
    } else {
        // Both players done - start game
        delete state.placementPhase;
        state.phase = GamePhase.FACTION_1;
        showPhaseTransition('Round 1 - Player 1 Turn');
        logMessage(state, 'Placement complete - game starting!');
    }
    
    updateUI();
    render();
}

// Rules modal management
let rulesLoaded = false;
let rulesContent = null;

async function openRulesModal() {
    const modal = document.getElementById('rules-modal');
    modal.classList.remove('hidden');
    
    // Load rules on first open
    if (!rulesLoaded) {
        rulesContent = await loadRulesContent();
        displayRulesTab('summary', rulesContent.summary);
        displayRulesTab('units', rulesContent.units);
        displayRulesTab('full', rulesContent.full);
        rulesLoaded = true;
    }
}

function closeRulesModal() {
    const modal = document.getElementById('rules-modal');
    modal.classList.add('hidden');
}

function switchRulesTab(tabName) {
    // Update button states
    document.querySelectorAll('.rules-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content display
    document.querySelectorAll('.rules-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Full Log Modal management
function openFullLogModal() {
    const modal = document.getElementById('full-log-modal');
    const logBody = document.getElementById('full-log-body');
    
    // Display all log entries with same formatting as small log
    logBody.innerHTML = '';
    for (const msg of state.log) {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'log-entry';
        entryDiv.innerHTML = enhanceLogMessage(msg, state);
        logBody.appendChild(entryDiv);
    }
    
    modal.classList.remove('hidden');
}

function closeFullLogModal() {
    const modal = document.getElementById('full-log-modal');
    modal.classList.add('hidden');
}

// Close modal on escape key
document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
        const rulesModal = document.getElementById('rules-modal');
        const logModal = document.getElementById('full-log-modal');
        const unitPickerModal = document.getElementById('unit-picker-modal');
        
        if (!unitPickerModal.classList.contains('hidden')) {
            closeUnitPickerModal();
        } else if (!rulesModal.classList.contains('hidden')) {
            closeRulesModal();
        } else if (!logModal.classList.contains('hidden')) {
            closeFullLogModal();
        }
    }
});

// Open rules with R key
document.addEventListener('keydown', (event) => {
    // R: Open Rules modal
    if (event.code === 'KeyR' && !event.ctrlKey && !event.metaKey) {
        const modal = document.getElementById('rules-modal');
        if (modal.classList.contains('hidden')) {
            openRulesModal();
        }
    }
    
    // L: Open Full Log modal
    if (event.code === 'KeyL' && !event.ctrlKey && !event.metaKey) {
        const modal = document.getElementById('full-log-modal');
        if (modal && modal.classList.contains('hidden')) {
            openFullLogModal();
        }
    }
});

// Unit Picker Modal
function showUnitPickerModal(units, onSelect) {
    const modal = document.getElementById('unit-picker-modal');
    const body = document.getElementById('unit-picker-body');
    
    // Clear previous options
    body.innerHTML = '';
    
    // Create option for each unit
    for (const unit of units) {
        const option = document.createElement('div');
        option.className = 'unit-picker-option';
        
        const hp = unit.maxHp - unit.damage;
        const hpClass = hp <= 2 ? 'unit-picker-hp-low' : '';
        
        option.innerHTML = `
            <div class="unit-picker-emoji">${unit.type.symbol}</div>
            <div class="unit-picker-info">
                <div class="unit-picker-name">${getUnitDisplayName(state, unit)}</div>
                <div class="unit-picker-hp ${hpClass}">❤️ ${hp}/${unit.maxHp}</div>
            </div>
        `;
        
        option.addEventListener('click', () => {
            closeUnitPickerModal();
            onSelect(unit);
        });
        
        body.appendChild(option);
    }
    
    modal.classList.remove('hidden');
}

function closeUnitPickerModal() {
    const modal = document.getElementById('unit-picker-modal');
    modal.classList.add('hidden');
}

// Damage Allocation Modal
function showDamageAllocationModal(enemies, totalDamage, attackingFaction, onConfirm) {
    const modal = document.getElementById('damage-allocation-modal');
    const modalHeader = modal.querySelector('.damage-allocation-header h2');
    const body = document.getElementById('damage-allocation-body');
    const confirmBtn = document.getElementById('damage-allocation-confirm');
    const remainingDisplay = document.getElementById('damage-remaining-value');
    
    // Update header with player info
    modalHeader.textContent = `Player ${attackingFaction}: Allocate Damage`;
    
    // Initialize allocation state
    const allocation = new Map();
    enemies.forEach(enemy => allocation.set(enemy.id, 0));
    
    let remaining = totalDamage;
    
    const updateDisplay = () => {
        remainingDisplay.textContent = remaining;
        confirmBtn.disabled = remaining !== 0;
    };
    
    // Clear previous content
    body.innerHTML = '';
    
    // Create allocation UI for each enemy
    for (const enemy of enemies) {
        const targetDiv = document.createElement('div');
        targetDiv.className = 'damage-target';
        
        const hp = enemy.maxHp - enemy.damage;
        
        targetDiv.innerHTML = `
            <div class="damage-target-header">
                <div class="damage-target-emoji">${enemy.type.symbol}</div>
                <div class="damage-target-info">
                    <div class="damage-target-name">${getUnitDisplayName(state, enemy)}</div>
                    <div class="damage-target-hp">❤️ ${hp}/${enemy.maxHp}</div>
                </div>
            </div>
            <div class="damage-controls">
                <button class="damage-btn damage-minus" data-enemy-id="${enemy.id}">−</button>
                <div class="damage-value" data-enemy-id="${enemy.id}">0</div>
                <button class="damage-btn damage-plus" data-enemy-id="${enemy.id}">+</button>
            </div>
        `;
        
        const minusBtn = targetDiv.querySelector('.damage-minus');
        const plusBtn = targetDiv.querySelector('.damage-plus');
        const valueDisplay = targetDiv.querySelector('.damage-value');
        
        minusBtn.addEventListener('click', () => {
            const current = allocation.get(enemy.id);
            if (current > 0) {
                allocation.set(enemy.id, current - 1);
                remaining++;
                valueDisplay.textContent = current - 1;
                updateDisplay();
            }
        });
        
        plusBtn.addEventListener('click', () => {
            const current = allocation.get(enemy.id);
            if (remaining > 0) {
                allocation.set(enemy.id, current + 1);
                remaining--;
                valueDisplay.textContent = current + 1;
                updateDisplay();
            }
        });
        
        body.appendChild(targetDiv);
    }
    
    // Handle confirm
    confirmBtn.onclick = () => {
        closeDamageAllocationModal();
        onConfirm(allocation);
    };
    
    updateDisplay();
    modal.classList.remove('hidden');
}

function closeDamageAllocationModal() {
    const modal = document.getElementById('damage-allocation-modal');
    modal.classList.add('hidden');
}

function handleAbilityTargetingClick(hex) {
    if (!state.abilityTargeting || !state.abilityTargeting.active) return;
    
    const currentPlayer = state.abilityTargeting.currentPlayer;
    
    // Get units that still need target selection for current player
    const playerUnitsNeedingTargets = state.abilityTargeting.unitsToTarget.filter(u => 
        u.faction === currentPlayer && 
        !state.abilityTargeting.selections.has(u.id)
    );
    
    if (playerUnitsNeedingTargets.length === 0) return;
    
    // Get the first unit that needs a target
    const sourceUnit = playerUnitsNeedingTargets[0];
    
    // Check if clicked location is a valid target for this unit's ability
    let validTarget = false;
    let targetData = null;
    
    if (sourceUnit.type.name === 'Spears') {
        // Pierce: needs adjacent enemy unit
        // Get all valid targets first, then filter by clicked hex
        const validTargets = getSpearsPierceTargets(state, sourceUnit);
        const validEnemiesAtHex = validTargets.filter(u => u.row === hex.row && u.col === hex.col);
        
        if (validEnemiesAtHex.length > 1) {
            // Show unit picker modal
            showUnitPickerModal(validEnemiesAtHex, (selectedUnit) => {
                state.abilityTargeting.selections.set(sourceUnit.id, { unitId: selectedUnit.id });
                logMessage(state, `${getUnitDisplayName(state, sourceUnit)} will target ${getUnitDisplayName(state, selectedUnit)}`);
                setTimeout(() => {
                    endPhase();
                }, 300);
                updateUI();
                render();
            });
            return;
        } else if (validEnemiesAtHex.length === 1) {
            validTarget = true;
            targetData = { unitId: validEnemiesAtHex[0].id };
        }
    } else if (sourceUnit.type.name === 'Archers') {
        // Volley: needs enemy unit in range 2
        // Get all valid targets first, then filter by clicked hex
        const validTargets = getArchersVolleyTargets(state, sourceUnit);
        const validEnemiesAtHex = validTargets.filter(u => u.row === hex.row && u.col === hex.col);
        
        if (validEnemiesAtHex.length > 1) {
            // Show unit picker modal
            showUnitPickerModal(validEnemiesAtHex, (selectedUnit) => {
                state.abilityTargeting.selections.set(sourceUnit.id, { unitId: selectedUnit.id });
                logMessage(state, `${getUnitDisplayName(state, sourceUnit)} will target ${getUnitDisplayName(state, selectedUnit)}`);
                setTimeout(() => {
                    endPhase();
                }, 300);
                updateUI();
                render();
            });
            return;
        } else if (validEnemiesAtHex.length === 1) {
            validTarget = true;
            targetData = { unitId: validEnemiesAtHex[0].id };
        }
    } else if (sourceUnit.type.name === 'Jesters') {
        // Taunt: needs adjacent enemy unit (range 1)
        // Get all valid targets first, then filter by clicked hex
        const validTargets = getJestersTauntTargets(state, sourceUnit);
        const validEnemiesAtHex = validTargets.filter(u => u.row === hex.row && u.col === hex.col);
        
        if (validEnemiesAtHex.length > 1) {
            // Show unit picker modal
            showUnitPickerModal(validEnemiesAtHex, (selectedUnit) => {
                state.abilityTargeting.selections.set(sourceUnit.id, { unitId: selectedUnit.id });
                logMessage(state, `${getUnitDisplayName(state, sourceUnit)} will taunt ${getUnitDisplayName(state, selectedUnit)}`);
                setTimeout(() => {
                    endPhase();
                }, 300);
                updateUI();
                render();
            });
            return;
        } else if (validEnemiesAtHex.length === 1) {
            validTarget = true;
            targetData = { unitId: validEnemiesAtHex[0].id };
        }
    } else if (sourceUnit.type.name === 'Cannon') {
        // Mortar: needs hex in range 2 with enemies
        const targets = getCannonMortarTargets(state, sourceUnit);
        const targetHex = targets.find(t => t.row === hex.row && t.col === hex.col);
        if (targetHex) {
            validTarget = true;
            targetData = { hex: { row: hex.row, col: hex.col } };
        }
    }
    
    if (validTarget) {
        // Store the selection
        state.abilityTargeting.selections.set(sourceUnit.id, targetData);
        logMessage(state, `${getUnitDisplayName(state, sourceUnit)} will target [${hex.row}, ${hex.col}]`);
        
        // Auto-advance to next unit or phase
        // Small delay to show the selection visually before moving on
        setTimeout(() => {
            endPhase();
        }, 300);
    } else {
        // Provide more helpful error message
        const abilityName = sourceUnit.type.name === 'Spears' ? 'Pierce (adjacent only)' : 
                           sourceUnit.type.name === 'Archers' ? 'Volley (range 1-2)' : 
                           sourceUnit.type.name === 'Cannon' ? 'Mortar (range 1-2)' : 'ability';
        logMessage(state, `No valid targets for ${getUnitDisplayName(state, sourceUnit)} ${abilityName} at [${hex.row}, ${hex.col}]`);
    }
    
    updateUI();
    render();
}

function handleClick(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const hex = renderer.pixelToHex(x, y);
    if (!hex) return;
    
    // Handle placement phase
    if (state.placementPhase) {
        handlePlacementClick(hex);
        return;
    }
    
    // Handle ability targeting phase
    if (state.phase === GamePhase.ABILITY_TARGETING) {
        handleAbilityTargetingClick(hex);
        return;
    }
    
    // Only allow moves during faction phases
    if (state.phase !== GamePhase.FACTION_1 && state.phase !== GamePhase.FACTION_2) {
        return;
    }
    
    const currentFaction = state.phase === GamePhase.FACTION_1 ? 1 : 2;
    
    if (state.selectedUnit) {
        // Special handling for COMMANDER selecting a friendly unit to move
        if (state.selectedUnit.type.id === UnitTypes.COMMANDER.id && !state.commanderTarget) {
            const validMove = state.validMoves.find(m => m.row === hex.row && m.col === hex.col);
            if (validMove) {
                // Player clicked on a hex with friendly units
                const friendlyUnits = getFactionUnitsAt(state, hex.row, hex.col, currentFaction)
                    .filter(u => u.id !== state.selectedUnit.id && u.damage < u.maxHp);
                
                if (friendlyUnits.length > 1) {
                    // Multiple units - show unit picker modal
                    showUnitPickerModal(friendlyUnits, (selectedTarget) => {
                        state.commanderTarget = selectedTarget;
                        state.validMoves = getValidMoves(selectedTarget);
                        render();
                    });
                } else if (friendlyUnits.length === 1) {
                    // Single unit - select it directly
                    state.commanderTarget = friendlyUnits[0];
                    state.validMoves = getValidMoves(state.commanderTarget);
                }
            } else {
                // Clicked away - cancel COMMANDER selection
                state.selectedUnit = null;
                state.validMoves = [];
            }
        } 
        // COMMANDER has selected a target unit, now move that unit
        else if (state.selectedUnit.type.id === UnitTypes.COMMANDER.id && state.commanderTarget) {
            const validMove = state.validMoves.find(m => m.row === hex.row && m.col === hex.col);
            if (validMove) {
                // Move the target unit
                moveUnit(state.commanderTarget, hex.row, hex.col);
                
                // Mark COMMANDER as activated (used Forward! ability)
                state.activatedUnits.add(state.selectedUnit.id);
                
                // Clear COMMANDER state
                state.selectedUnit = null;
                state.commanderTarget = null;
                state.validMoves = [];
            } else {
                // Clicked away - cancel and go back to COMMANDER selection
                state.commanderTarget = null;
                state.validMoves = getValidMoves(state.selectedUnit);
            }
        }
        // Normal unit movement
        else {
            const validMove = state.validMoves.find(m => m.row === hex.row && m.col === hex.col);
            if (validMove) {
                const movedUnit = state.selectedUnit;
                moveUnit(movedUnit, hex.row, hex.col);
                
                // If unit now has pending second move, re-select it
                if (state.pendingSecondMove === movedUnit.id) {
                    state.selectedUnit = movedUnit;
                    state.validMoves = getValidMoves(movedUnit);
                } else {
                    state.selectedUnit = null;
                    state.validMoves = [];
                }
            } else {
                // Clicked on invalid move - clear selection
                // If there's a pending second move, skip it by clicking away
                if (state.pendingSecondMove) {
                    state.activatedUnits.add(state.pendingSecondMove);
                    state.pendingSecondMove = null;
                }
                state.selectedUnit = null;
                state.validMoves = [];
            }
        }
    } else {
        // Try to select a unit
        const units = getFactionUnitsAt(state, hex.row, hex.col, currentFaction);
        
        // If there's a pending second move, only allow selecting that unit
        if (state.pendingSecondMove) {
            const pendingUnit = units.find(u => u.id === state.pendingSecondMove);
            if (pendingUnit) {
                state.selectedUnit = pendingUnit;
                state.validMoves = getValidMoves(state.selectedUnit);
            }
        } else {
            // Normal selection: if multiple units at hex, show unit picker
            const unactivated = units.filter(u => !state.activatedUnits.has(u.id));
            if (unactivated.length > 1) {
                // Multiple unactivated units - show unit picker modal
                showUnitPickerModal(unactivated, (selectedUnit) => {
                    state.selectedUnit = selectedUnit;
                    state.validMoves = getValidMoves(selectedUnit);
                    render();
                });
            } else if (unactivated.length === 1) {
                // Single unactivated unit - select it directly
                state.selectedUnit = unactivated[0];
                state.validMoves = getValidMoves(state.selectedUnit);
            }
        }
    }
    
    render();
}

// Move a unit
function moveUnit(unit, newRow, newCol) {
    const oldRow = unit.row;
    const oldCol = unit.col;
    
    // Calculate distance moved
    const distanceMoved = hexDistance(oldRow, oldCol, newRow, newCol);
    
    // For Mounted units: track if this is the second move in this activation
    const isMountedSecondMove = unit.type.id === UnitTypes.MOUNTED.id && unit.movedThisTurn;
    
    // Add move animation
    unit.moveAnimation = {
        startRow: oldRow,
        startCol: oldCol,
        endRow: newRow,
        endCol: newCol,
        startTime: Date.now(),
        duration: 400
    };
    
    unit.row = newRow;
    unit.col = newCol;
    unit.movedThisTurn = true;
    
    // For Mounted units: handle first vs second move
    if (unit.type.id === UnitTypes.MOUNTED.id && !isMountedSecondMove) {
        // First move: set pending second move, don't mark as activated
        state.pendingSecondMove = unit.id;
    } else {
        // Regular units or Mounted second move: mark as activated
        state.activatedUnits.add(unit.id);
        state.pendingSecondMove = null; // Clear pending if it was the second move
    }
    
    // Check for engagement
    const enemyFaction = unit.faction === 1 ? 2 : 1;
    const enemiesAtHex = getFactionUnitsAt(state, newRow, newCol, enemyFaction);
    if (enemiesAtHex.length > 0) {
        const enemyUnits = enemiesAtHex.map(e => getUnitDisplayName(state, e)).join(' & ');
        logMessage(state, `${getUnitDisplayName(state, unit)} engages with ${enemyUnits} at (${newRow}, ${newCol})!`);
        
        // Apply Mounted Charge bonus if this is the second move (charge)
        if (isMountedSecondMove) {
            // Check for Spears Counter Charge: look for non-engaged enemy Spears in adjacent hexes
            const adjacentHexes = getAdjacentHexes(newRow, newCol);
            const counterChargingSpears = [];
            for (const adjHex of adjacentHexes) {
                const unitsAtHex = getFactionUnitsAt(state, adjHex.row, adjHex.col, enemyFaction);
                for (const u of unitsAtHex) {
                    if (u.type.id === UnitTypes.SPEARS.id && u.damage < u.maxHp && !isEngaged(state, u)) {
                        counterChargingSpears.push(u);
                    }
                }
            }
            
            if (counterChargingSpears.length > 0) {
                // Counter Charge activated - cancel charge damage and damage the Mounted unit
                const spear = counterChargingSpears[0]; // Use first Spears unit found
                applySpearCounterCharge(state, spear, unit);
                logMessage(state, `${getUnitDisplayName(state, unit)}'s charge is countered!`);
            } else {
                // No counter charge - apply normal charge bonus
                if (enemiesAtHex.length > 1) {
                    // Multiple enemies - let player choose which one gets trampled
                    showUnitPickerModal(enemiesAtHex, (selectedEnemy) => {
                        applyMountedChargeBonus(state, unit, selectedEnemy, 2);
                        logMessage(state, `${getUnitDisplayName(state, unit)} tramples ${getUnitDisplayName(state, selectedEnemy)}!`);
                        updateUI();
                        render();
                    });
                    // Don't log move message yet - will be shown after target selection
                    return; // Exit early, updateUI will be called in callback
                } else {
                    // Single enemy - apply charge bonus directly
                    applyMountedChargeBonus(state, unit, enemiesAtHex[0], 2);
                }
            }
        }
    }
    
    logMessage(state, `${getUnitDisplayName(state, unit)} moves to [${newRow}, ${newCol}]`);
    updateUI();
}

// Get units that have abilities requiring target selection
function getUnitsNeedingAbilityTargets(state) {
    const units = [];
    
    for (const unit of state.units) {
        if (unit.damage >= unit.maxHp) continue; // Dead units
        
        // Check for abilities that need targeting
        const unitIsEngaged = isEngaged(state, unit);
        
        // Pierce (melee ability) - needs target if not engaged and has adjacent enemies
        if (unit.type.name === 'Spears' && !unitIsEngaged) {
            const targets = getSpearsPierceTargets(state, unit);
            if (targets.length > 0) {
                units.push(unit);
                continue;
            }
        }
        
        // Volley (ranged ability) - needs target if not engaged and has enemies in range
        if (unit.type.name === 'Archers' && !unitIsEngaged) {
            const targets = getArchersVolleyTargets(state, unit);
            if (targets.length > 0) {
                units.push(unit);
                continue;
            }
        }
        
        // Mortar (ranged ability) - needs target hex if not moved and enemies in range
        if (unit.type.name === 'Cannon' && !unit.movedThisTurn && !unitIsEngaged) {
            const targets = getCannonMortarTargets(state, unit);
            if (targets.length > 0) {
                units.push(unit);
                continue;
            }
        }
    }
    
    return units;
}

// Execute resolution phase with sequential animations
async function executeResolutionSequence(state) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    // Clear combat tracking from previous resolution phase
    state.unitsInCombatThisTurn.clear();
    
    // Clear ability targeting state now that resolution is starting
    if (state.abilityTargeting) {
        state.abilityTargeting.active = false;
    }
    
    // Wait for initial phase transition overlay to disappear (1500ms)
    await delay(1600);
    
    // 1. Combat - wait for damage animations (1000ms each)
    showPhaseTransition('⚔️ Combat');
    await delay(1600); // Wait for phase transition
    
    // Use async combat with damage allocation modal
    await resolveCombatAsync(state, (enemies, totalDamage, attackingFaction) => {
        return new Promise((resolve) => {
            showDamageAllocationModal(enemies, totalDamage, attackingFaction, (allocation) => {
                resolve(allocation);
            });
        });
    });
    
    updateUI();
    render();
    await delay(1200); // Wait for combat animations + buffer
    
    // 2. Melee Abilities - wait for ability + damage animations
    showPhaseTransition('🗡️ Melee Abilities');
    await delay(1600); // Wait for phase transition
    resolveMeleeAbilities(state);
    updateUI();
    render();
    await delay(1800); // Wait for ability (800ms) + damage (1000ms)
    
    // 3. Ranged Abilities - wait for ability + damage animations
    showPhaseTransition('🏹 Ranged Abilities');
    await delay(1600); // Wait for phase transition
    resolveRangedAbilities(state);
    updateUI();
    render();
    await delay(1800); // Wait for ability (800ms) + damage (1000ms)
    
    // 4. Castle damage - wait for blink animation
    showPhaseTransition('🏰 Castle Damage');
    await delay(1600); // Wait for phase transition
    calculateCastleDamage(state);
    updateUI();
    render();
    await delay(1000); // Wait for castle blink (800ms) + buffer
    
    // After all animations, check win condition
    const winResult = checkWinCondition(state);
    if (winResult) {
        state.phase = GamePhase.GAME_OVER;
        showPhaseTransition('Game Over!');
        logMessage(state, `Game Over! ${winResult.reason}`);
    } else {
        // Start next round
        showPhaseTransition(`Round ${state.round + 1} - Player 1 Turn`);
        state.phase = GamePhase.FACTION_1;
        state.activatedUnits.clear();
        state.round++;
        // Reset moved flags for new round
        for (const unit of state.units) {
            unit.movedThisTurn = false;
            unit.lastTarget = null;
        }
        delete state.pendingSecondMove;
        logMessage(state, 'Player 1 faction phase');
    }
    
    updateUI();
    render();
}

// End current phase
function endPhase() {
    // Clear any pending second moves when phase ends
    state.pendingSecondMove = null;
    
    if (state.phase === GamePhase.FACTION_1) {
        showPhaseTransition('Player 2 Turn');
        state.phase = GamePhase.FACTION_2;
        state.activatedUnits.clear();
        logMessage(state, 'Player 2 faction phase');
    } else if (state.phase === GamePhase.FACTION_2) {
        // Check if any units have abilities that need targeting
        const unitsNeedingTargeting = getUnitsNeedingAbilityTargets(state);
        
        if (unitsNeedingTargeting.length > 0) {
            // Check which players have abilities
            const p2HasAbilities = unitsNeedingTargeting.some(u => u.faction === 2);
            const p1HasAbilities = unitsNeedingTargeting.some(u => u.faction === 1);
            
            // Determine starting player and message
            let startingPlayer = 2; // Default P2 first
            let transitionMessage = 'Select Ability Targets';
            
            if (!p2HasAbilities && p1HasAbilities) {
                // Only P1 has abilities, start with P1
                startingPlayer = 1;
                transitionMessage = 'Player 1: Select Ability Targets';
            } else if (p2HasAbilities && !p1HasAbilities) {
                // Only P2 has abilities
                transitionMessage = 'Player 2: Select Ability Targets';
            }
            
            // Transition to ability targeting phase
            showPhaseTransition(transitionMessage);
            state.phase = GamePhase.ABILITY_TARGETING;
            state.abilityTargeting = {
                active: true,
                currentPlayer: startingPlayer,
                selections: new Map(),
                unitsToTarget: unitsNeedingTargeting
            };
            updateUI();
            // Render after phase transition completes to show first unit and targets
            setTimeout(() => {
                render();
            }, 1600);
        } else {
            // No abilities need targeting, go straight to resolution
            showPhaseTransition('Resolution Phase');
            state.phase = GamePhase.RESOLUTION_COMBAT;
            executeResolutionSequence(state);
        }
        return;
    } else if (state.phase === GamePhase.ABILITY_TARGETING) {
        // Player confirmed their current unit's selection
        const currentPlayer = state.abilityTargeting.currentPlayer;
        
        // Check if current player has more units needing targets
        const currentPlayerUnitsNeedingTargets = state.abilityTargeting.unitsToTarget.filter(u => 
            u.faction === currentPlayer && 
            !state.abilityTargeting.selections.has(u.id)
        );
        
        if (currentPlayerUnitsNeedingTargets.length > 0) {
            // Current player has more units to target - stay with this player
            logMessage(state, `Next unit for Player ${currentPlayer}...`);
            // Force immediate UI update for next unit
            requestAnimationFrame(() => {
                updateUI();
                render();
            });
        } else if (currentPlayer === 2) {
            // P2 done, check if P1 has units needing targeting
            const p1UnitsNeedingTargeting = state.abilityTargeting.unitsToTarget.filter(u => 
                u.faction === 1 && 
                !state.abilityTargeting.selections.has(u.id)
            );
            
            if (p1UnitsNeedingTargeting.length > 0) {
                // Switch to P1
                state.abilityTargeting.currentPlayer = 1;
                showPhaseTransition('Player 1: Select Ability Targets');
                logMessage(state, 'Player 1 selecting ability targets...');
                // Force immediate UI update when switching players
                requestAnimationFrame(() => {
                    updateUI();
                    render();
                });
            } else {
                // P1 has no abilities, show message then go to resolution
                showPhaseTransition('🎯 Player 1: No Abilities Requiring Targets');
                setTimeout(() => {
                    showPhaseTransition('Resolution Phase');
                    state.phase = GamePhase.RESOLUTION_COMBAT;
                    executeResolutionSequence(state);
                }, 1600);
            }
        } else {
            // P1 done, start resolution
            showPhaseTransition('Resolution Phase');
            state.phase = GamePhase.RESOLUTION_COMBAT;
            executeResolutionSequence(state);
        }
        return;
    }
    
    state.selectedUnit = null;
    state.validMoves = [];
    updateUI();
    render();
}

// Show phase transition animation
// Track phase transition timeout to prevent overlaps
let phaseTransitionTimeout = null;

function showPhaseTransition(text) {
    const overlay = document.getElementById('phase-transition-overlay');
    const textElement = document.getElementById('phase-transition-text');
    
    // Cancel any pending timeout
    if (phaseTransitionTimeout) {
        clearTimeout(phaseTransitionTimeout);
    }
    
    textElement.textContent = text;
    overlay.classList.remove('hidden');
    
    // Hide after animation (1.5s)
    phaseTransitionTimeout = setTimeout(() => {
        overlay.classList.add('hidden');
        phaseTransitionTimeout = null;
    }, 1500);
}

// Update UI elements
function updateUI() {
    // Placement phase display
    if (state.placementPhase) {
        const placedCount = state.placementPhase.placedUnits.length;
        const stateDisplay = document.getElementById('state-display');
        const playerColor = state.placementPhase.currentPlayer === 1 ? 'var(--player1-color)' : 'var(--player2-color)';
        stateDisplay.innerHTML = `
            <span style="color: ${playerColor}; font-weight: bold;">
                🎲 Player ${state.placementPhase.currentPlayer}
            </span>
            <span style="margin: 0 0.5rem; opacity: 0.5;">•</span>
            <span style="opacity: 0.8;">Placement (${placedCount}/6)</span>
        `;
        
        const placementControls = document.getElementById('placement-controls');
        const btnEndPhase = document.getElementById('btn-end-phase');
        placementControls.classList.remove('hidden');
        btnEndPhase.classList.add('hidden');
        
        // Render log during placement phase
        renderMessageLog();
        
        return;
    }
    
    // Hide placement controls during normal play
    const placementControls = document.getElementById('placement-controls');
    const btnEndPhase = document.getElementById('btn-end-phase');
    placementControls.classList.add('hidden');
    btnEndPhase.classList.remove('hidden');
    
    // Disable button during automated resolution phases
    const automatedPhases = [
        GamePhase.RESOLUTION_COMBAT,
        GamePhase.RESOLUTION_MELEE,
        GamePhase.RESOLUTION_RANGED,
        GamePhase.RESOLUTION_CASTLE
    ];
    
    if (automatedPhases.includes(state.phase)) {
        btnEndPhase.innerHTML = 'Resolving...';
        btnEndPhase.disabled = true;
    }
    // Update button text for ability targeting phase
    else if (state.phase === GamePhase.ABILITY_TARGETING && state.abilityTargeting) {
        const currentPlayer = state.abilityTargeting.currentPlayer;
        const playerUnitsNeedingTargets = state.abilityTargeting.unitsToTarget.filter(u => 
            u.faction === currentPlayer && 
            !state.abilityTargeting.selections.has(u.id)
        );
        
        if (playerUnitsNeedingTargets.length > 0) {
            const currentUnit = playerUnitsNeedingTargets[0];
            const hasSelection = state.abilityTargeting.selections.has(currentUnit.id);
            
            if (hasSelection) {
                btnEndPhase.innerHTML = 'Confirm Selection <span style="opacity: 0.7; font-size: 0.85em;">(Space/Enter)</span>';
                btnEndPhase.disabled = false;
            } else {
                btnEndPhase.innerHTML = 'Select a Target';
                btnEndPhase.disabled = true;
            }
        } else {
            btnEndPhase.innerHTML = 'Continue <span style="opacity: 0.7; font-size: 0.85em;">(Space/Enter)</span>';
            btnEndPhase.disabled = false;
        }
    } else {
        btnEndPhase.innerHTML = 'End Phase <span style="opacity: 0.7; font-size: 0.85em;">(Space/Enter)</span>';
        btnEndPhase.disabled = false;
    }
    
    // Phase display with visual enhancements
    const stateDisplay = document.getElementById('state-display');
    
    // Phase configurations with icons and colors
    const phaseConfigs = {
        [GamePhase.SETUP]: { name: 'Setup', icon: '⚙️', color: '#94a3b8' },
        [GamePhase.FACTION_1]: { name: 'Player 1 Move', icon: '⚔️', color: 'var(--player1-color)' },
        [GamePhase.FACTION_2]: { name: 'Player 2 Move', icon: '⚔️', color: 'var(--player2-color)' },
        [GamePhase.ABILITY_TARGETING]: { name: 'Select Targets', icon: '🎯', color: '#00ffff' },
        [GamePhase.RESOLUTION_COMBAT]: { name: 'Resolution', icon: '⚡', color: '#fbbf24' },
        [GamePhase.GAME_OVER]: { name: 'Game Over', icon: '🏁', color: '#ef4444' }
    };
    
    let displayText = '';
    
    // Special handling for ability targeting to show current unit
    if (state.phase === GamePhase.ABILITY_TARGETING && state.abilityTargeting) {
        const currentPlayer = state.abilityTargeting.currentPlayer;
        const playerUnitsNeedingTargets = state.abilityTargeting.unitsToTarget.filter(u => 
            u.faction === currentPlayer && 
            !state.abilityTargeting.selections.has(u.id)
        );
        
        if (playerUnitsNeedingTargets.length > 0) {
            const unit = playerUnitsNeedingTargets[0];
            const playerColor = currentPlayer === 1 ? 'var(--player1-color)' : 'var(--player2-color)';
            displayText = `
                <span style="opacity: 0.7; font-size: 0.9em;">🔄 Round ${state.round}</span>
                <span style="margin: 0 0.5rem; opacity: 0.5;">•</span>
                <span style="color: ${playerColor}; font-weight: bold;">
                    Player ${currentPlayer}
                </span>
                <span style="margin: 0 0.5rem; opacity: 0.5;">•</span>
                <span style="color: #00ffff; font-weight: bold;">
                    🎯 ${getUnitDisplayName(state, unit)} - Select Target
                </span>
            `;
        }
    }
    
    if (!displayText) {
        const config = phaseConfigs[state.phase] || { name: state.phase, icon: '', color: '#fff' };
        displayText = `
            <span style="opacity: 0.7; font-size: 0.9em;">🔄 Round ${state.round}</span>
            <span style="margin: 0 0.5rem; opacity: 0.5;">•</span>
            <span style="color: ${config.color}; font-weight: bold;">
                ${config.icon} ${config.name}
            </span>
        `;
    }
    
    // Build enhanced display with round number, icon, and colored phase name
    stateDisplay.innerHTML = displayText;
    
    // Castle damage
    document.getElementById('p1-castle-damage').textContent = state.castleDamage[1];
    document.getElementById('p2-castle-damage').textContent = state.castleDamage[2];
    
    // Update unit lists
    updateUnitList(1, document.getElementById('p1-units'));
    updateUnitList(2, document.getElementById('p2-units'));
    
    // Update destroyed units
    updateDestroyedUnits(1, document.getElementById('p1-destroyed'));
    updateDestroyedUnits(2, document.getElementById('p2-destroyed'));
    
    // Message log
    renderMessageLog();
}

// Render message log
function renderMessageLog() {
    const logDiv = document.getElementById('message-log');
    logDiv.innerHTML = '';
    
    // Show last 20 messages in reverse chronological order
    const recentMessages = state.log.slice(-20).reverse();
    for (const msg of recentMessages) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'log-entry';
        msgDiv.innerHTML = enhanceLogMessage(msg, state);
        logDiv.appendChild(msgDiv);
    }
}

// Enhance log message with emojis and colors
function enhanceLogMessage(message, state) {
    // Build a map of unit references to their colors
    const unitColorMap = new Map();
    if (state && state.units) {
        for (const unit of state.units) {
            // Create keys for both with and without numbers
            const baseName = unit.type.name;
            const numberedName = `${baseName} #${unit.number}`;
            unitColorMap.set(numberedName, unit.color);
            // If this is the only unit of this type in its faction, also map the base name
            const sameTypeCount = state.units.filter(u => 
                u.faction === unit.faction && u.type.id === unit.type.id
            ).length;
            if (sameTypeCount === 1) {
                unitColorMap.set(baseName, unit.color);
            }
        }
    }
    
    // ONLY color existing unit names - don't add symbols
    // Symbols are already in the message from getUnitDisplayName()
    let enhanced = message;
    for (const unitType of Object.values(UnitTypes)) {
        // Match unit name with optional number: "Mounted" or "Mounted #1"
        // Capture the whole unit reference (name + optional number)
        const pattern = new RegExp(`\\b(${unitType.name}(?:\\s+#\\d+)?)\\b`, 'g');
        
        enhanced = enhanced.replace(pattern, (match, nameWithNumber) => {
            const color = unitColorMap.get(nameWithNumber);
            if (color) {
                return `<span class="unit-name" style="color: ${color}; font-weight: bold;">${nameWithNumber}</span>`;
            } else {
                return `<span class="unit-name">${nameWithNumber}</span>`;
            }
        });
    }
    
    // Color player mentions
    enhanced = enhanced.replace(/Player 1/g, '<span class="player-1-text">Player 1</span>');
    enhanced = enhanced.replace(/Player 2/g, '<span class="player-2-text">Player 2</span>');
    
    return enhanced;
}

// Update destroyed units display
function updateDestroyedUnits(faction, container) {
    container.innerHTML = '';
    
    if (state.destroyedUnits && state.destroyedUnits[faction]) {
        for (const unit of state.destroyedUnits[faction]) {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'destroyed-unit';
            unitDiv.textContent = unit.type.symbol;
            unitDiv.title = unit.type.name;
            container.appendChild(unitDiv);
        }
    }
}

// Update a player's unit list display
function updateUnitList(faction, container) {
    const factionUnits = state.units.filter(u => u.faction === faction);
    
    container.innerHTML = '';
    
    for (const unit of factionUnits) {
        const hp = unit.maxHp - unit.damage;
        const isDead = hp <= 0;
        
        const unitItem = document.createElement('div');
        unitItem.className = 'unit-item';
        unitItem.style.cssText = `
            padding: 8px;
            margin: 4px 0;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 4px;
            border-left: 3px solid ${unit.color || (faction === 1 ? '#4facfe' : '#00f260')};
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        
        const isActivated = state.activatedUnits && state.activatedUnits.has(unit.id);
        const opacity = isDead ? 0.3 : (isActivated ? 0.5 : 1.0);
        
        // Generate heart icons or death indicator based on HP
        let healthDisplay = '';
        if (isDead) {
            healthDisplay = '<span style="font-size: 1.2rem; color: #666;">💀 DEAD</span>';
        } else {
            // Generate hearts for living units (filled hearts for current HP, empty for damage)
            for (let i = 0; i < unit.maxHp; i++) {
                if (i < hp) {
                    healthDisplay += '<span style="color: #ef4444;">❤️</span>';
                } else {
                    healthDisplay += '<span style="color: #555; opacity: 0.5;">🖤</span>';
                }
            }
        }
        
        const displayName = getUnitDisplayName(state, unit);
        const statusText = isDead ? '💀 Dead' : (isActivated ? '✓ Activated' : '');
        const unitColor = unit.color || (faction === 1 ? '#4facfe' : '#00f260');
        
        unitItem.innerHTML = `
            <div style="font-size: 1.8rem; line-height: 1; opacity: ${opacity}; ${isDead ? 'filter: grayscale(1);' : ''}">
                ${unit.type.symbol}
            </div>
            <div style="flex: 1; opacity: ${opacity};">
                <div style="font-size: 0.75rem; font-weight: 600; margin-bottom: 2px; color: ${unitColor};">
                    ${displayName}
                </div>
                <div style="font-size: 0.9rem; line-height: 1.2;">
                    ${healthDisplay}
                </div>
                ${statusText ? `<div style="font-size: 0.65rem; color: ${isDead ? '#ef4444' : '#999'}; margin-top: 2px;">${statusText}</div>` : ''}
            </div>
        `;
        
        container.appendChild(unitItem);
    }
}

// Render the game
function render() {
    renderer.drawBoard(state);
    
    // Check if any units have active animations, pending moves, or need final render
    const hasActiveAnimations = state.units.some(u => u.hitAnimation || u.destroyAnimation || u.moveAnimation);
    const hasPendingMove = state.pendingSecondMove !== null;
    const needsFinalRender = state.units.some(u => u._needsFinalRender);
    
    // Clear final render flags
    if (needsFinalRender && !hasActiveAnimations) {
        state.units.forEach(u => delete u._needsFinalRender);
    }
    
    if (hasActiveAnimations || hasPendingMove || needsFinalRender) {
        requestAnimationFrame(render);
    }
}

// Show setup UI for faction selection
function showSetupUI() {
    const message = `Player ${setupPhase.currentPlayer} - Select 6 units and place them on your side`;
    logMessage(state, message);
}

// Show ability targeting UI
function showAbilityTargets(unit) {
    let targets = [];
    let abilityType = null;
    
    if (unit.type.id === UnitTypes.ARCHERS.id) {
        targets = getArchersVolleyTargets(state, unit);
        abilityType = 'archersVolley';
    } else if (unit.type.id === UnitTypes.CANNON.id) {
        targets = getCannonMortarTargets(state, unit);
        abilityType = 'cannonMortar';
    } else if (unit.type.id === UnitTypes.SPEARS.id) {
        targets = getSpearsPierceTargets(state, unit);
        abilityType = 'spearsPierce';
    } else if (unit.type.id === UnitTypes.JESTERS.id) {
        targets = getJestersTauntTargets(state, unit);
        abilityType = 'jestersTaunt';
    }
    
    if (targets.length > 0) {
        abilityTargeting.active = true;
        abilityTargeting.sourceUnit = unit;
        abilityTargeting.targets = targets;
        abilityTargeting.abilityType = abilityType;
        logMessage(state, `${unit.type.name} - Select a target for ability`);
    }
}

// Confirm setup for current player
function confirmSetup() {
    if (setupPhase.currentPlayer === 1) {
        setupPhase.currentPlayer = 2;
        logMessage(state, `Player 1 setup complete. Player 2 - place your units`);
    } else {
        // Both players done, start the game
        setupPhase.active = false;
        state.phase = GamePhase.FACTION_1;
        logMessage(state, 'Game started! Player 1 move phase');
    }
    updateUI();
}

// Event listeners
canvas.addEventListener('click', handleClick);

// Add keyboard support
document.addEventListener('keydown', (event) => {
    // C: Confirm placement (during placement phase)
    if (event.code === 'KeyC') {
        if (state.placementPhase) {
            event.preventDefault();
            confirmPlacement();
        }
    }
    
    // Space or Enter: End Phase
    if (event.code === 'Space' || event.code === 'Enter') {
        if (state.phase === GamePhase.FACTION_1 || state.phase === GamePhase.FACTION_2) {
            event.preventDefault();
            endPhase();
        }
    }
    
    // Escape: Deselect unit and skip pending second move
    if (event.code === 'Escape') {
        if (state.selectedUnit) {
            state.selectedUnit = null;
            state.validMoves = [];
            // If escaping from a pending second move, mark unit as done
            if (state.pendingSecondMove) {
                state.activatedUnits.add(state.pendingSecondMove);
                state.pendingSecondMove = null;
            }
            updateUI();
            render();
        }
    }
    
});
document.getElementById('btn-end-phase').addEventListener('click', endPhase);
document.getElementById('btn-confirm-placement').addEventListener('click', confirmPlacement);
document.getElementById('btn-rules').addEventListener('click', openRulesModal);
document.getElementById('btn-close-rules').addEventListener('click', closeRulesModal);

const btnFullLog = document.getElementById('btn-full-log');
if (btnFullLog) {
    btnFullLog.addEventListener('click', openFullLogModal);
}

const btnCloseLog = document.getElementById('btn-close-log');
if (btnCloseLog) {
    btnCloseLog.addEventListener('click', closeFullLogModal);
}

// Rules modal tab switching
document.querySelectorAll('.rules-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        switchRulesTab(tabName);
    });
});

// Mode selection handlers
document.querySelectorAll('.mode-option').forEach(option => {
    option.addEventListener('click', () => {
        // Remove selected class from all options
        document.querySelectorAll('.mode-option').forEach(opt => opt.classList.remove('selected'));
        
        // Add selected class to clicked option
        option.classList.add('selected');
    });
});

// Check URL hash immediately (before page loads) to avoid showing modal
function checkUrlHashImmediate() {
    const hash = window.location.hash.slice(1).toLowerCase();
    const validModes = ['starter', 'learning', 'demo', 'random', 'draft'];
    
    if (validModes.includes(hash)) {
        // Map alias names to actual modes
        let mode = hash;
        if (hash === 'starter' || hash === 'learning') {
            mode = 'demo';
        }
        
        return mode;
    }
    
    return null;
}

// Store the detected mode
const detectedMode = checkUrlHashImmediate();

// Hide modal immediately if mode was detected in URL
if (detectedMode) {
    // We need to hide the modal before it becomes visible
    // This will be done in the DOMContentLoaded handler
}

function checkUrlHash() {
    if (detectedMode) {
        // Auto-select and start with detected mode
        const selectedOption = document.querySelector(`[data-mode="${detectedMode}"]`);
        if (selectedOption) {
            document.querySelectorAll('.mode-option').forEach(opt => opt.classList.remove('selected'));
            selectedOption.classList.add('selected');
            
            // Start immediately without the 300ms delay
            startSelectedGame();
        }
    }
}

// Start the selected game mode
function startSelectedGame() {
    const selectedOption = document.querySelector('.mode-option.selected');
    const selectedMode = selectedOption.dataset.mode;
    const modal = document.getElementById('mode-selection-modal');
    modal.classList.add('hidden');
    
    // Show the game app (was hidden to prevent background showing through modal)
    const app = document.getElementById('app');
    app.classList.remove('hidden');
    
    if (selectedMode === 'demo') {
        setupDemoGame();
    } else if (selectedMode === 'random') {
        setupRandomGame();
    } else if (selectedMode === 'draft') {
        setupDraftGame();
    }
}

document.getElementById('start-game-btn').addEventListener('click', startSelectedGame);

// Mulligan UI event listeners

// Setup game with random unit placement
function setupRandomGame() {
    state = createGameState();
    state.phase = GamePhase.SETUP;
    state.setupMode = 'random';
    
    logMessage(state, '🎲 Welcome to SmallTricks! Random armies assembled.');
    
    // Generate random unit selections for both factions (but don't place yet)
    const randomUnits1 = [];
    const randomUnits2 = [];
    const unitTypes = [
        UnitTypes.ARCHERS,
        UnitTypes.CANNON,
        UnitTypes.MOUNTED,
        UnitTypes.ASSAULT_BEASTS,
        UnitTypes.SPEARS,
        UnitTypes.JESTERS
    ];
    
    for (let i = 0; i < 6; i++) {
        randomUnits1.push(unitTypes[i]);
        randomUnits2.push(unitTypes[i]);
    }
    
    state.draftSelected = { 1: randomUnits1, 2: randomUnits2 };
    
    // Start placement phase for Player 1
    state.placementPhase = {
        currentPlayer: 1,
        unitsToPlace: [],
        placedUnits: [],
        selectedUnit: null
    };
    
    // Place all units for Player 1 in default positions (row 3-5, spreading across columns)
    for (let i = 0; i < randomUnits1.length; i++) {
        const unitType = randomUnits1[i];
        const row = 3 + Math.floor(i / 3); // Distribute across rows 3-5
        const col = i % 3; // Distribute across cols 0-2
        const unit = createUnit(unitType, 1, row, col);
        state.units.push(unit);
        state.placementPhase.placedUnits.push(unit);
    }
    
    logMessage(state, 'Random setup - Player 1: Click units to reposition them on rows 3-5. Press Confirm when ready.');
    
    updateUI();
    render();
}

// Setup game with draft mode
function setupDraftGame() {
    state = createGameState();
    state.phase = GamePhase.SETUP;
    state.setupMode = 'draft';
    
    logMessage(state, '🎯 Welcome to SmallTricks! Draft your army wisely.');
    
    state.draftUnits = generateRandomDraftPool();
    state.draftPhase = 'selection';
    state.draftSelected = { 1: [], 2: [] };
    state.draftPickOrder = generateDraftOrder();
    state.draftCurrentPick = 0;
    
    logMessage(state, 'Draft mode: Players take turns selecting units');
    
    showDraftUI();
    updateUI();
    render();
}

// Generate draft pick order (snake draft: 1-2-2-1-1-2-2-1-1-2-2-1)
function generateDraftOrder() {
    return [1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1];
}

// Generate random pool of 12 units with possible duplicates
function generateRandomDraftPool() {
    const allUnitTypes = Object.values(UnitTypes);
    const pool = [];
    
    for (let i = 0; i < 12; i++) {
        const randomType = allUnitTypes[Math.floor(Math.random() * allUnitTypes.length)];
        pool.push({
            type: randomType,
            id: `draft-${i}` // Unique ID for each pool slot
        });
    }
    
    return pool;
}

// Show draft UI
function showDraftUI() {
    const overlay = document.getElementById('draft-overlay');
    overlay.classList.remove('hidden');
    
    updateDraftUI();
}

// Update draft UI
function updateDraftUI() {
    const currentPlayer = state.draftPickOrder[state.draftCurrentPick];
    const pickNumber = state.draftSelected[currentPlayer].length + 1;
    
    document.getElementById('draft-current-player').textContent = currentPlayer;
    document.getElementById('draft-pick-number').textContent = pickNumber;
    
    // Update both players' selections
    for (const player of [1, 2]) {
        const playerUnits = state.draftSelected[player];
        const countElem = document.getElementById(`draft-p${player}-count`);
        const listElem = document.getElementById(`draft-p${player}-units`);
        
        countElem.textContent = playerUnits.length;
        listElem.innerHTML = '';
        
        for (const unitType of playerUnits) {
            const unitDiv = document.createElement('div');
            unitDiv.className = 'draft-selected-unit';
            unitDiv.textContent = `${unitType.symbol} ${unitType.name}`;
            listElem.appendChild(unitDiv);
        }
    }
    
    // Update available units
    const unitsGrid = document.getElementById('draft-units');
    unitsGrid.innerHTML = '';
    
    for (const unitInfo of state.draftUnits) {
        const unitDiv = document.createElement('div');
        unitDiv.className = 'draft-unit-option';
        
        unitDiv.innerHTML = `
            <div class="draft-unit-emoji">${unitInfo.type.symbol}</div>
            <div class="draft-unit-name">${unitInfo.type.name}</div>
        `;
        
        unitDiv.addEventListener('click', () => selectDraftUnit(unitInfo));
        
        unitsGrid.appendChild(unitDiv);
    }
}

// Select unit in draft
function selectDraftUnit(unitInfo) {
    const currentPlayer = state.draftPickOrder[state.draftCurrentPick];
    
    // Add unit to player's selection
    state.draftSelected[currentPlayer].push(unitInfo.type);
    
    // Remove this unit from the pool (depleting)
    const index = state.draftUnits.findIndex(u => u.id === unitInfo.id);
    if (index !== -1) {
        state.draftUnits.splice(index, 1);
    }
    
    logMessage(state, `Player ${currentPlayer} selects ${unitInfo.type.name}`);
    
    // Move to next pick
    state.draftCurrentPick++;
    
    // Check if draft is complete
    if (state.draftCurrentPick >= state.draftPickOrder.length) {
        completeDraft();
    } else {
        updateDraftUI();
    }
}

// Complete draft and place units
function completeDraft() {
    const overlay = document.getElementById('draft-overlay');
    overlay.classList.add('hidden');
    
    // Start placement phase for Player 1
    state.placementPhase = {
        currentPlayer: 1,
        unitsToPlace: [],
        placedUnits: [],
        allUnitsPlaced: false,
        selectedUnit: null
    };
    
    // Place all units for Player 1 in default positions (row 3-5, spreading across columns)
    const p1Units = state.draftSelected[1];
    for (let i = 0; i < p1Units.length; i++) {
        const unitType = p1Units[i];
        const row = 3 + Math.floor(i / 3); // Distribute across rows 3-5
        const col = i % 3; // Distribute across cols 0-2
        const unit = createUnit(unitType, 1, row, col);
        state.units.push(unit);
        state.placementPhase.placedUnits.push(unit);
    }
    
    logMessage(state, 'Player 1 - Click units to reposition them on rows 3-5. Press Confirm when ready.');
    updateUI();
    render();
}

// Initialize the game (show mode selection modal)
// The modal will be hidden and game starts when player clicks "Start Game"

// Check URL hash when page loads
document.addEventListener('DOMContentLoaded', () => {
    if (detectedMode) {
        // Hide modal if we detected a mode in the URL
        const modal = document.getElementById('mode-selection-modal');
        modal.classList.add('hidden');
        
        // Show the game app
        const app = document.getElementById('app');
        app.classList.remove('hidden');
        
        // Start game immediately
        checkUrlHash();
    }
});

window.addEventListener('load', () => {
    // Only check hash if no mode was detected (as fallback for non-DOMContentLoaded scenario)
    if (!detectedMode) {
        checkUrlHash();
    }
});

// Castle damage animation trigger
window.triggerCastleDamageAnimation = function(faction) {
    const elementId = faction === 1 ? 'p1-castle-damage' : 'p2-castle-damage';
    const element = document.getElementById(elementId);
    if (!element) return;
    
    // Remove existing animation class
    element.classList.remove('castle-damage-blink');
    
    // Force reflow to restart animation
    void element.offsetWidth;
    
    // Add animation class
    element.classList.add('castle-damage-blink');
    
    // Remove class after animation completes
    setTimeout(() => {
        element.classList.remove('castle-damage-blink');
    }, 800);
};

// Expose render globally so it can be called from the renderer on resize
window.gameRender = render;
