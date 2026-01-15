// Hex grid renderer
const HEX_SIZE = 50; // Radius of hexagon
const HEX_WIDTH = HEX_SIZE * 2;
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;

// Colors
const COLORS = {
    hexBg: '#f8f9fa',
    hexBorder: '#2d3748',
    castle1: '#3b82f6',  // Blue - Player 1 castle (bottom)
    castle2: '#22c55e',  // Green - Player 2 castle (top)
    player1: '#3b82f6',
    player2: '#22c55e',
    highlight: '#fbbf24',
    validMove: 'rgba(34, 197, 94, 0.4)',
    engaged: 'rgba(239, 68, 68, 0.3)'
};

export class HexRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.rows = 6;
        this.cols = 6;
        
        this.updateCanvasSize();
        
        // Recalculate canvas size on window resize
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
            // Trigger a re-render by calling render (will be defined in game.js)
            if (window.gameRender) {
                window.gameRender();
            }
        });
    }
    
    hexDistance(r1, c1, r2, c2) {
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
        return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
    }
    
    updateCanvasSize() {
        // Calculate canvas size
        const width = this.cols * HEX_WIDTH * 0.75 + HEX_SIZE * 0.5 + 40;
        const height = this.rows * HEX_HEIGHT + HEX_HEIGHT / 2 + 40;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.offsetX = HEX_SIZE + 20;
        this.offsetY = HEX_HEIGHT / 2 + 20;
    }
    
    // Get pixel coordinates for hex center
    hexToPixel(row, col) {
        const x = this.offsetX + col * HEX_WIDTH * 0.75;
        const y = this.offsetY + row * HEX_HEIGHT + (col % 2 === 1 ? HEX_HEIGHT / 2 : 0);
        return { x, y };
    }
    
    // Get hex coordinates from pixel position
    pixelToHex(px, py) {
        // Rough estimation first
        const col = Math.round((px - this.offsetX) / (HEX_WIDTH * 0.75));
        const rowOffset = col % 2 === 1 ? HEX_HEIGHT / 2 : 0;
        const row = Math.round((py - this.offsetY - rowOffset) / HEX_HEIGHT);
        
        // Check if within bounds
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            // Verify point is actually in hex
            const { x, y } = this.hexToPixel(row, col);
            const dist = Math.sqrt((px - x) ** 2 + (py - y) ** 2);
            if (dist < HEX_SIZE) {
                return { row, col };
            }
        }
        return null;
    }
    
    // Draw a single hexagon
    drawHex(row, col, fillColor, strokeColor = COLORS.hexBorder, lineWidth = 2) {
        const { x, y } = this.hexToPixel(row, col);
        const ctx = this.ctx;
        
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i; // Flat-top hex (starts at 0 for right vertex)
            const hx = x + HEX_SIZE * Math.cos(angle);
            const hy = y + HEX_SIZE * Math.sin(angle);
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
    
    // Draw the entire board
    drawBoard(state) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw all hexes
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                let fillColor = COLORS.hexBg;
                let strokeColor = COLORS.hexBorder;
                let lineWidth = 2;
                
                // Castle rows
                if (row === 0) {
                    fillColor = COLORS.castle2; // Player 2 castle (top)
                } else if (row === 5) {
                    fillColor = COLORS.castle1; // Player 1 castle (bottom)
                }
                
                // Highlight valid placement zones
                if (state.placementPhase) {
                    const validRows = state.placementPhase.currentPlayer === 1 ? [3, 4, 5] : [0, 1, 2];
                    if (validRows.includes(row)) {
                        fillColor = state.placementPhase.currentPlayer === 1 
                            ? 'rgba(79, 172, 254, 0.3)' 
                            : 'rgba(0, 242, 96, 0.3)';
                    }
                }
                
                // Highlight valid moves
                if (state.validMoves.some(m => m.row === row && m.col === col)) {
                    fillColor = COLORS.validMove;
                }
                
                // Highlight ability targeting
                if (state.abilityTargeting && state.abilityTargeting.active) {
                    const currentPlayer = state.abilityTargeting.currentPlayer;
                    const playerUnitsNeedingTargets = state.abilityTargeting.unitsToTarget.filter(u => 
                        u.faction === currentPlayer && 
                        !state.abilityTargeting.selections.has(u.id)
                    );
                    
                    if (playerUnitsNeedingTargets.length > 0) {
                        const sourceUnit = playerUnitsNeedingTargets[0];
                        
                        // Check if this hex is a valid target
                        let isValidTarget = false;
                        
                        if (sourceUnit.type.name === 'Spears' || sourceUnit.type.name === 'Archers') {
                            // Check if there's an enemy unit here that's a valid target
                            const unitHere = state.units.find(u => u.row === row && u.col === col && u.damage < u.maxHp);
                            if (unitHere && unitHere.faction !== sourceUnit.faction) {
                                const dist = this.hexDistance(sourceUnit.row, sourceUnit.col, row, col);
                                if (sourceUnit.type.name === 'Spears') {
                                    // Adjacent only (distance exactly 1)
                                    if (dist === 1) isValidTarget = true;
                                } else if (sourceUnit.type.name === 'Archers') {
                                    // Range 2 (distance 1-2, not 0)
                                    if (dist > 0 && dist <= 2) isValidTarget = true;
                                }
                            }
                        } else if (sourceUnit.type.name === 'Cannon') {
                            // Mortar targets hex in range 2 with enemies (distance 1-2, not 0)
                            const dist = this.hexDistance(sourceUnit.row, sourceUnit.col, row, col);
                            if (dist > 0 && dist <= 2) {
                                const enemiesHere = state.units.filter(u => 
                                    u.row === row && u.col === col && 
                                    u.faction !== sourceUnit.faction && 
                                    u.damage < u.maxHp
                                );
                                if (enemiesHere.length > 0) isValidTarget = true;
                            }
                        }
                        
                        if (isValidTarget) {
                            fillColor = 'rgba(255, 100, 100, 0.3)'; // Red highlight for targets
                        }
                        
                        // Also highlight the source unit's hex to show which unit is targeting
                        if (row === sourceUnit.row && col === sourceUnit.col) {
                            fillColor = 'rgba(255, 200, 0, 0.4)'; // Gold highlight for source
                        }
                    }
                }
                
                this.drawHex(row, col, fillColor, strokeColor, lineWidth);
                
                // Apply castle damage animation effect
                if ((row === 0 || row === 5) && state.castleDamageAnimation) {
                    const faction = row === 0 ? 2 : 1;
                    const animation = state.castleDamageAnimation[faction];
                    
                    if (animation) {
                        const elapsed = Date.now() - animation.startTime;
                        if (elapsed < animation.duration) {
                            const progress = elapsed / animation.duration;
                            let hitIntensity = 0;
                            let alphaPulse = 1.0;
                            
                            // Different phases of animation (same as unit hit animation)
                            if (progress < 0.2) {
                                // 0-200ms: Bright red flash
                                hitIntensity = 1.0;
                                alphaPulse = 1.0;
                            } else if (progress < 0.8) {
                                // 200-800ms: Red tint with pulsing alpha
                                hitIntensity = 0.7;
                                alphaPulse = 0.7 + Math.sin(progress * 20) * 0.3; // Pulse effect
                            } else {
                                // 800-1000ms: Fade out
                                hitIntensity = 0.3 * (1 - (progress - 0.8) / 0.2);
                                alphaPulse = 1.0;
                            }
                            
                            // Apply red flash effect over the castle hex
                            if (hitIntensity > 0) {
                                const { x, y } = this.hexToPixel(row, col);
                                ctx.save();
                                ctx.globalAlpha = alphaPulse * hitIntensity;
                                ctx.fillStyle = `rgba(255, 0, 0, ${hitIntensity})`;
                                
                                // Draw hex shape with red overlay
                                ctx.beginPath();
                                for (let i = 0; i < 6; i++) {
                                    const angle = (Math.PI / 3) * i;
                                    const hx = x + HEX_SIZE * Math.cos(angle);
                                    const hy = y + HEX_SIZE * Math.sin(angle);
                                    if (i === 0) {
                                        ctx.moveTo(hx, hy);
                                    } else {
                                        ctx.lineTo(hx, hy);
                                    }
                                }
                                ctx.closePath();
                                ctx.fill();
                                ctx.restore();
                            }
                        } else {
                            // Animation complete, remove it
                            state.castleDamageAnimation[faction] = null;
                        }
                    }
                }
            }
        }
        
        // Draw units
        this.drawUnits(state);
        
        // Highlight selected unit (during gameplay)
        if (state.selectedUnit) {
            const unit = state.selectedUnit;
            const { x, y } = this.hexToPixel(unit.row, unit.col);
            ctx.beginPath();
            ctx.arc(x, y, HEX_SIZE - 5, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.highlight;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        
        // Highlight selected unit (during placement phase)
        if (state.placementPhase && state.placementPhase.selectedUnit) {
            const unit = state.placementPhase.selectedUnit;
            const { x, y } = this.hexToPixel(unit.row, unit.col);
            ctx.beginPath();
            ctx.arc(x, y, HEX_SIZE - 5, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.highlight;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
    }
    
    // Draw units on the board
    drawUnits(state) {
        const ctx = this.ctx;
        
        // Draw units with move animations separately
        const animatingUnits = [];
        const staticUnits = [];
        
        for (const unit of state.units) {
            // Skip dead units without animation
            if (unit.damage >= unit.maxHp && !unit.destroyAnimation) continue;
            
            // Skip opponent units during placement
            if (state.placementPhase && unit.faction !== state.placementPhase.currentPlayer) {
                continue;
            }
            
            if (unit.moveAnimation) {
                animatingUnits.push(unit);
            } else {
                staticUnits.push(unit);
            }
        }
        
        // Group static units by position
        const unitsByPos = new Map();
        for (const unit of staticUnits) {
            const key = `${unit.row},${unit.col}`;
            if (!unitsByPos.has(key)) {
                unitsByPos.set(key, { faction1: [], faction2: [] });
            }
            const group = unitsByPos.get(key);
            if (unit.faction === 1) group.faction1.push(unit);
            else group.faction2.push(unit);
        }
        
        // Draw static units at each position
        for (const [key, groups] of unitsByPos) {
            const [row, col] = key.split(',').map(Number);
            const { x, y } = this.hexToPixel(row, col);
            
            // Check if engaged
            const isEngaged = groups.faction1.length > 0 && groups.faction2.length > 0;
            if (isEngaged) {
                // Draw engagement indicator
                ctx.beginPath();
                ctx.arc(x, y, HEX_SIZE - 8, 0, Math.PI * 2);
                ctx.fillStyle = COLORS.engaged;
                ctx.fill();
            }
            
            // Position units consistently: faction1 (bottom player) on bottom, faction2 (top player) on top
            const allUnits = [...groups.faction1, ...groups.faction2];
            const positions = this.getUnitPositions(groups.faction1.length, groups.faction2.length);
            
            // Determine current player faction
            const currentFaction = state.phase === 'faction_1' ? 1 : state.phase === 'faction_2' ? 2 : 0;
            
            allUnits.forEach((unit, i) => {
                const pos = positions[i];
                const isActivated = state.activatedUnits.has(unit.id);
                const isPending = state.pendingSecondMove === unit.id;
                // Can only move if: right faction, not activated, AND (no pending move OR this is the pending unit)
                const canMove = currentFaction === unit.faction && !isActivated && (!state.pendingSecondMove || isPending);
                
                this.drawUnit(state, unit, x + pos.dx, y + pos.dy, isActivated, canMove, isPending);
            });
        }
        
        // Draw animating units
        for (const unit of animatingUnits) {
            const anim = unit.moveAnimation;
            const elapsed = Date.now() - anim.startTime;
            const progress = Math.min(1, elapsed / anim.duration);
            
            if (progress >= 1) {
                // Animation complete - delete and mark for final render
                delete unit.moveAnimation;
                unit._needsFinalRender = true;
            }
            
            // Interpolate position
            const startPos = this.hexToPixel(anim.startRow, anim.startCol);
            const endPos = this.hexToPixel(anim.endRow, anim.endCol);
            
            const x = startPos.x + (endPos.x - startPos.x) * progress;
            const y = startPos.y + (endPos.y - startPos.y) * progress;
            
            const isActivated = state.activatedUnits.has(unit.id);
            const isPending = state.pendingSecondMove === unit.id;
            this.drawUnit(state, unit, x, y, isActivated, false, isPending);
        }
    }
    
    // Get offset positions for multiple units in same hex
    getUnitPositions(faction1Count, faction2Count) {
        const offset = 18;
        const positions = [];
        
        // Bottom positions for faction1 (bottom player)
        if (faction1Count === 1) {
            positions.push({ dx: 0, dy: offset });
        } else if (faction1Count === 2) {
            positions.push({ dx: -offset, dy: offset });
            positions.push({ dx: offset, dy: offset });
        }
        
        // Top positions for faction2 (top player)
        if (faction2Count === 1) {
            positions.push({ dx: 0, dy: -offset });
        } else if (faction2Count === 2) {
            positions.push({ dx: -offset, dy: -offset });
            positions.push({ dx: offset, dy: -offset });
        }
        
        // If only one faction, center them
        if (faction1Count + faction2Count === 1) {
            return [{ dx: 0, dy: 0 }];
        }
        
        return positions;
    }
    
    // Draw a single unit
    drawUnit(state, unit, x, y, isActivated = false, canMove = false, isPending = false) {
        const ctx = this.ctx;
        const radius = 20;
        
        // Check for hit animation (1000ms with red tint and pulse)
        let hitIntensity = 0;
        let alphaPulse = 1.0;
        if (unit.hitAnimation) {
            const elapsed = Date.now() - unit.hitAnimation.startTime;
            if (elapsed < unit.hitAnimation.duration) {
                const progress = elapsed / unit.hitAnimation.duration;
                
                // Different phases of animation
                if (progress < 0.2) {
                    // 0-200ms: Bright red flash
                    hitIntensity = 1.0;
                    alphaPulse = 1.0;
                } else if (progress < 0.8) {
                    // 200-800ms: Red tint with pulsing alpha
                    hitIntensity = 0.7;
                    alphaPulse = 0.7 + Math.sin(progress * 20) * 0.3; // Pulse effect
                } else {
                    // 800-1000ms: Fade back to normal
                    hitIntensity = (1 - progress) * 3; // Fade out
                    alphaPulse = 1.0;
                }
            } else {
                delete unit.hitAnimation;
            }
        }
        
        // Enhanced hit flash effect with red tint and alpha blink
        if (hitIntensity > 0) {
            ctx.globalAlpha = alphaPulse;
            
            // Red glow around unit
            ctx.beginPath();
            ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(239, 68, 68, ${hitIntensity * 0.5})`;
            ctx.fill();
            
            // Red border
            ctx.strokeStyle = `rgba(239, 68, 68, ${hitIntensity})`;
            ctx.lineWidth = 4;
            ctx.stroke();
            
            ctx.globalAlpha = 1.0;
        }
        
        // Ability activation animation (yellow/white flash)
        if (unit.abilityAnimation) {
            const elapsed = Date.now() - unit.abilityAnimation.startTime;
            if (elapsed < unit.abilityAnimation.duration) {
                const progress = elapsed / unit.abilityAnimation.duration;
                const intensity = Math.sin(progress * Math.PI); // Pulse up then down
                
                // Yellow/white glow for ability activation
                ctx.beginPath();
                ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(251, 191, 36, ${intensity * 0.4})`;
                ctx.fill();
                ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.8})`;
                ctx.lineWidth = 3;
                ctx.stroke();
            } else {
                delete unit.abilityAnimation;
            }
        }
        
        // Special highlight for pending second move (animated pulse)
        if (isPending) {
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2; // 0 to 1 pulse
            ctx.beginPath();
            ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(139, 92, 246, ${0.2 + pulse * 0.3})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(139, 92, 246, ${0.6 + pulse * 0.4})`;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        // Highlight glow for unit needing ability target selection
        else if (state.abilityTargeting && state.abilityTargeting.active) {
            const currentPlayer = state.abilityTargeting.currentPlayer;
            const playerUnitsNeedingTargets = state.abilityTargeting.unitsToTarget.filter(u => 
                u.faction === currentPlayer && 
                !state.abilityTargeting.selections.has(u.id)
            );
            
            if (playerUnitsNeedingTargets.length > 0 && playerUnitsNeedingTargets[0].id === unit.id) {
                // This is the unit that needs to select a target - gold glow
                ctx.beginPath();
                ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 200, 0, 0.4)'; // Gold glow
                ctx.fill();
                ctx.strokeStyle = '#ffc000';
                ctx.lineWidth = 4;
                ctx.stroke();
            }
        }
        // Highlight glow for units that can move
        else if (canMove) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
            ctx.fill();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // Check for destroy animation (enhanced with explosive effect)
        let destroyAlpha = 1.0;
        let destroyScale = 1.0;
        let destroyRotation = 0;
        let destroyColorFlash = 0;
        let particleEffect = null;
        if (unit.destroyAnimation) {
            const elapsed = Date.now() - unit.destroyAnimation.startTime;
            if (elapsed < unit.destroyAnimation.duration) {
                const progress = elapsed / unit.destroyAnimation.duration;
                
                // Three-phase animation:
                // Phase 1 (0-0.2): Explosive expansion with red flash
                // Phase 2 (0.2-0.6): Rapid spin and shrink
                // Phase 3 (0.6-1.0): Fade out completely
                
                if (progress < 0.2) {
                    // Phase 1: Explosive expansion
                    const phase1 = progress / 0.2;
                    destroyAlpha = 1.0;
                    destroyScale = 1.0 + phase1 * 0.5; // Expand to 150%
                    destroyRotation = phase1 * Math.PI; // Half rotation
                    destroyColorFlash = 1.0 - phase1; // Red flash at start
                    
                    // Particle burst effect
                    particleEffect = {
                        progress: phase1,
                        particles: 8,
                        radius: phase1 * 40,
                        alpha: 1.0 - phase1
                    };
                } else if (progress < 0.6) {
                    // Phase 2: Rapid spin and shrink
                    const phase2 = (progress - 0.2) / 0.4;
                    destroyAlpha = 1.0 - phase2 * 0.3;
                    destroyScale = 1.5 - phase2 * 1.3; // Shrink from 150% to 20%
                    destroyRotation = Math.PI + phase2 * Math.PI * 4; // Spin rapidly
                } else {
                    // Phase 3: Final fade
                    const phase3 = (progress - 0.6) / 0.4;
                    destroyAlpha = 0.7 - phase3 * 0.7;
                    destroyScale = 0.2 - phase3 * 0.2; // Shrink to nothing
                    destroyRotation = Math.PI * 5 + phase3 * Math.PI * 2;
                }
            } else {
                delete unit.destroyAnimation;
                destroyAlpha = 0;
                destroyScale = 0;
            }
        }
        
        // Draw particle effect if present
        if (particleEffect) {
            ctx.save();
            ctx.globalAlpha = particleEffect.alpha;
            for (let i = 0; i < particleEffect.particles; i++) {
                const angle = (Math.PI * 2 / particleEffect.particles) * i;
                const px = x + Math.cos(angle) * particleEffect.radius;
                const py = y + Math.sin(angle) * particleEffect.radius;
                const particleSize = 8 * (1 - particleEffect.progress);
                
                ctx.beginPath();
                ctx.arc(px, py, particleSize, 0, Math.PI * 2);
                ctx.fillStyle = unit.faction === 1 ? '#3b82f6' : '#22c55e';
                ctx.fill();
            }
            ctx.restore();
        }
        
        // Apply destroy transformations
        if (destroyAlpha < 1.0) {
            ctx.save();
            ctx.globalAlpha = destroyAlpha;
            ctx.translate(x, y);
            ctx.rotate(destroyRotation);
            ctx.scale(destroyScale, destroyScale);
            ctx.translate(-x, -y);
        }
        
        // Apply red flash overlay for explosion effect
        if (destroyColorFlash > 0) {
            ctx.save();
            ctx.globalAlpha = destroyColorFlash * 0.7;
            ctx.beginPath();
            ctx.arc(x, y, radius * destroyScale * 1.2, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.restore();
        }
        
        // Unit circle with unique color
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = unit.color || (unit.faction === 1 ? COLORS.player1 : COLORS.player2);
        
        // If activated, reduce opacity (combine with destroy alpha)
        if (isActivated) {
            ctx.globalAlpha *= 0.5;
        }
        
        ctx.fill();
        
        // Border color/width indicates activation state or can move
        if (canMove) {
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 4;
        } else {
            ctx.strokeStyle = isActivated ? '#666' : '#1a1a2e';
            ctx.lineWidth = isActivated ? 1 : 3;
        }
        ctx.stroke();
        
        // Unit symbol (emoji)
        ctx.fillStyle = isActivated ? '#ccc' : '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(unit.type.symbol, x, y);
        
        // Reset alpha
        ctx.globalAlpha = 1.0;
        
        // Restore context if destroy animation is active
        if (destroyAlpha < 1.0) {
            ctx.restore();
        }
        
        // HP display (current/max format) - only if not being destroyed
        if (unit.damage > 0 && unit.damage < unit.maxHp && destroyAlpha >= 1.0) {
            const hp = unit.maxHp - unit.damage;
            ctx.fillStyle = hp <= 2 ? '#ef4444' : '#22c55e';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${hp}/${unit.maxHp}`, x + radius + 10, y - radius + 2);
        }
    }
}
