// Rules loader - provides rules content and formatting
// ** BUILT VERSION WITH EMBEDDED RULES **

// Quick rules summary
const QUICK_SUMMARY = `
# Smalltricks - Quick Start

## Objective
Score more damage on your opponent's Castle than they score on yours.

## Setup
Each player arranges 6 units in their half of the board (rows 0-2 for Player 2, rows 3-5 for Player 1).

## How to Play

### Movement Phase
Players take turns activating units one by one. Each unit moves according to its type:
- Most units: 1 hex
- Mounted units: 2 hexes (Charge ability)
- Assault Beasts: Can move while Engaged (Trample)

### Resolution Phase
1. **Combats**: Units in the same hex damage each other
2. **Melee Abilities**: Non-engaged units use melee abilities
3. **Ranged Abilities**: Non-engaged units use ranged abilities  
4. **Castle Damage**: Units in enemy castle row deal 1 damage per unit

## Winning
- First player to reach 2+ more damage loses
- First player with 1+ more damage for 2 consecutive rounds loses
- Otherwise, clear winner or draw based on remaining unit power
`;

// Embedded full rules (built from RULES_FULL.md)
const EMBEDDED_RULES_FULL = `
# Smalltricks

Smalltricks is a quick game about the first engagement between two armies, a game of chess' opening moves, a game of parry and riposte.

Games are quick and brutal.

# Building in the Open

This is a live document. I will include notes about rule tweaks that I am considering, generally marked in parenthesis as TODO.

You can give feedback in this thread:
[](https://boardgamegeek.com/thread/3531621/playtesting-smalltricks-opening-moves-and-tactics)

The game is part of the 2025 Two Player Print and Play Design Contest Entry you can find in this thread:
[](https://boardgamegeek.com/thread/3530940/2025-two-player-print-and-play-game-design-contest)

# Components

A 6x6 Hexagonal boardgame with flat top hexagons. A printable image should come with the rules.

12 dice to represent the Units. Using d6 is the default, but use any dice or token of your liking.

Pen and paper, or a phone to track the damage on Units.

# Rules of a Match

A Smalltricks Match is played in a series of short Games, of any amount of your choice or as time permits or the players agree to: single Match, best of 3, best of 5, first to 10...

The starting player alternates between Games of a Match. Decide by dice roll or any other method which player starts in the first Game.

### Components

Players are called **Factions** in the game.

The board represents a **Battlefied** is split in half, each half belonging to a Faction.

The top or bottom border row of their corresponding half is the **Castle** of that Faction.

Each dice in the board represents a **Unit** and belongs to one Faction. Units are the main pieces of the game, and will move, use skills and deal damage to make a Faction win the game. Each Faction is composed by 6 Units.

### Building your Faction

Preparing the Unit composition and starting arrangement of your Faction is half of the fun of the game.

Build your Faction out of 6 Units. You can have multiples of the same Unit.

Units come in many types, each with abilities that make them unique and create rock-paper-scissors situations between them.

_You can create your own variants such as rolling your Faction at the beggining of a Match, at the beginning of each Game. If you do, consider allowing other sub-variants such as allowing reroll(s) or shifting dice up/down by 1._

# Playing a Game

The objective of each Smalltricks Game is for the Units of one Faction to score more damage to the opponent's Castle than their opponent's, before the Game ends.

### Play for Fun

This game is played to have fun. Don't be that person.

## Games, Rounds and Phases

Pick a First and Second Faction for the Game. These alternate between Games of a Matches. Pick or roll the First Faction for the first Game.

Each Game is played in Rounds. A Round consists of 3 phases: the First Faction phase, the Second Faction phase, and the Resolution phase.

### Rule conflict resolution

If there are simultaneous actions that cannot be resolved simultaneously, the Second Faction decides the order in which they resolve.

### The end of the Game

When a player ends one Round with 2 more damage on their Castle than their opponent, they lose.

When a player ends 2 consecutive Rounds with 1 more damage on their Castle than their opponent, they lose.

Otherwise, if the damage is even and a Faction has overwhelmingly more Unit power left they are considered the winner. This could mean the game ends in a draw if there is no clear winner.

### Setup of the game

Secretly arrange your Units in your Faction's half of the Battlefied and tell your opponent when you're ready.

You can use a screen to obstruct the view, or write the arrangement in your phone or a piece of paper.

### Faction Phase

During a Faction phase, the Player gets to activate all of their Units. They activate the Units one by one, moving the Unit according to their type. A Unit cannot be activated twice in the same phase.

### Resolution Phase

During the Resolution phase, several sub-phases are resolved in order:

- Combats: Opposing Units in the same hexagon are considered Engaged and have to resolve a Combat. All combats are considered to resolve simultaneously.
- Melee Abilities: Melee abilities from Units not Engaged are applied now.
- Ranged Abilities: Ranged abilities from Units not Engaged are applied now.
- Castle Damage: Any unit in an opposing Castle row that has not Engaged deals damage to the castle.

(??? TODO Combat as last action? Ranged before melee?)

## Faction Phase

### Units on the battlefield

Units are how Factions interact with each other. They occupy hexagons on the Battlefield, and adhere to some rules.

#### Adjacent

Two hexagons are adjacent if they share a side.

#### Range and LoS

Ranges are calculated counting hexagons from the origin hexagon, in any of the possible movement directions. There are no LoS requirements in Smalltricks.

#### Engagement

A Unit is considered Engaged if they are in the same hexagon as a Unit of an opposing Faction.

An Engaged unit cannot move, cannot use Abilities and cannot damage a Castle.

#### Two Units per Faction limit

Each hexagon can contain up to two units of the same Faction. That means each hexagon can have up to four units, two of each Faction.

#### One-and-two Engagements

If a Faction has a single Unit in a hexagon, and the opposing faction has two, the Player of the Faction with the single Unit decides which opposing Unit is Engaged for the purpose of preventing their Abilities to trigger during the Resolution Phase.
(??? TODO decide engagement upon entering the hexagon, make it "sticky")

The Faction with the unit that remains not Engaged can choose in the Resolution Phase whether to Engage to resolve a Combat or use their Abilities instead.

#### Death

When a Unit has take all damage they allow and their life is reduced to 0 or less, they are immediatelly removed from play.

### Phase actions

During their Faction Phase, the player activates their Units, one by one, to do a Movement.

#### Movement

Units can move in any of the 6 adjacent directions or stay in their hexagon. They cannot move outside the Battlefield.

Units can move through their allied Units, but stop and become Engaged if they enter a hexagon with an opposing Unit.

#### Movement Abilities

Follow the rules of the Unit type to see whether special Movement Abilities apply.

## Resolution Phase

### Combat

Combat is resolved as the first sub-phase of the Resolution Phase.

Units Engaged in a Combat, up to two per Faction due to the limit per hexagon, deal 2 damage per Unit Engaged. The damage can be divided any way they choose between any opposing Units Engaged in the same Combat.

Damage is resolved simultaneously.

Repeat the process for all Combats in the Battlefield. All Combats are considered simultaneous.

### Melee and Ranged Abilities

Refer to each Unit for what their Abilities do.

First, all Melee abilities resolve simultaneously, then all Ranged abilities resolve simultaneously.

### Castle Damage

Castle damage is resolved as the last sub-phase of the Resolution Phase.

To score damage, a Unit must be in the Castle row while not Engaged at the end of a Resolution Phase.
`;

// Embedded units reference (built from UNITS.md)
const EMBEDDED_UNITS = `
## Units

Units are what your Faction is composed of. They are arranged in a power triangle where Spears -> Mounted -> Archers -> Spears, and the other units throw the balance off.

### Base Stats

Unless a special rule applies, All Units can move 1 hexagon per Movement, have a Range of 0, deal 2 damage in Combat, and have 5 points of life.

### Unit Types [Dice Face]

#### Archers \\[1\\]

- Volley (Ranged Ability): Deal 2 damage to a Unit in Range 2.
  - -1 damage if this Unit has moved this turn.
  - -1 damage if the target is not the same as last time this ability was used, i.e. choosing a new target, or coming out of an Engagement.

#### Cannon \\[2\\]

- Mortar Fire (Ranged Ability): If this Unit has not moved, it deals 1 damage to all opponent Units in a hexagon in Range 2.

#### Mounted \\[3\\]

- Charge (Movement Ability): Move 1 additional hexagon this turn. If you move 2 hexagons and end in a hexagon where you Engage with one or two opponent Units, deal 2 damage to one the Units of your choice. You can move through hexagons with 2 Units of your Fation, but you cannot end movement there.
  _NOTE: Spears can counter Charge, dealing the damage to this Unit instead._

#### Assault Beasts \\[4\\]

- Trample (Movement Ability): This Unit can move even when Engaged. (TODO ??? When entering an hexagon with opponent Units, deal 1 damage to each Unit.)

#### Spears \\[5\\]

- Pierce (Melee Ability): Deal 1 damage to a unit in Range 1.
- Counter Charge (Movement Ability): If this Unit is (??? TODO in Range 1 of) the hexagon that is the target of a Charge by an opponent Mounted Unit, then the Mounted Unit's charge deals no damage and the Mounted Unit receives 3 damage instead.

#### Jesters \\[6\\]

- Taunt (Movement Ability): Instead of moving, this Unit can force an opponent Unit in Range 1 to move into their hexagon.

### Alternative Unit Types [Suggested Dice Face]

You can use these units instead of the basic ones to spice things up. It is recommended to always keep the Archers-Mounted-Spears trifecta.

#### Muskets \\[2\\]

- Fire! (Ranged Ability): (??? TODO If Muskets did not move this turn,) Deal 1 damage to all opponent Units in hexagons in the same column as the Muskets.

#### Aerial \\[4\\]

- Assault (Movement Ability): Move to any hexagon without a Unit in it, nor any hexagon of the opponent's Castle.

#### Commander \\[4\\]

- Forward! (Movement Ability): Instead of moving, force another allied Unit in Range 2 to move 1 hexagon.

#### Militia \\[6\\]

- Rowdy Crowd: Only 1 Militia Unit per Faction per hexagon.

- Melee expertise: This unit deals 3 damage in Combat.

#### Battery Ram \\[6\\]

- Crash Through (Melee Ability): If this Unit is at the opponent's Castle and is not Engaged, you win the Game.
`;

export async function loadRulesContent() {
    try {
        console.log('Loading embedded rules content...');
        
        return {
            summary: QUICK_SUMMARY,
            full: EMBEDDED_RULES_FULL,
            units: EMBEDDED_UNITS
        };
    } catch (error) {
        console.error('Error loading rules:', error);
        return {
            summary: '# Error\nCould not load rules content.',
            full: '# Error\nCould not load full rules.',
            units: '# Error\nCould not load units reference.'
        };
    }
}

export function displayRulesTab(tabName, content) {
    const container = document.getElementById(`tab-${tabName}`);
    if (!container) return;
    
    container.innerHTML = formatMarkdown(content);
}

function formatMarkdown(markdown) {
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Lists
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Paragraphs
    html = html.split('\n\n').map(para => {
        if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<li')) {
            return para;
        }
        return `<p>${para}</p>`;
    }).join('\n');
    
    return html;
}
