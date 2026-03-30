# Ronaldo Football Game

## Current State
The project previously contained a Space Invaders arcade game. We are rebuilding it as a new football penalty shootout game.

## Requested Changes (Diff)

### Add
- Penalty shootout game with Ronaldo as the player character
- Canvas-based game engine using React + requestAnimationFrame
- Game states: menu, aiming, shoot, result, game over
- Player (Ronaldo sprite) at the bottom, goal with goalkeeper at the top
- Aim mechanic: moving reticle/arrow left-right, player clicks to set power then shoot
- Goalkeeper AI: dives randomly to one side when ball is kicked
- Scoring: 5 penalty rounds per game, track goals scored
- Visual: stadium background, pixel art sprites, CR7 branding, orange+dark navy theme
- Score display, round counter, result messages
- Sound effects via Web Audio API (kick, save, goal)
- Penalty series win/loss screen with replay option

### Modify
- Replace all existing Space Invaders frontend code with football game

### Remove
- All Space Invaders game logic and components

## Implementation Plan
1. Replace App.tsx with penalty shootout game using Canvas API
2. Implement game states: MENU, AIMING, POWER, FLYING, RESULT, GAMEOVER
3. Draw stadium background, goal posts, goalkeeper, Ronaldo, ball
4. Aim reticle oscillates left/right; first click locks aim, second click determines power and shoots
5. Ball animates toward goal; goalkeeper dives
6. Determine if goal scored based on aim accuracy vs goalkeeper position
7. Track 5 penalties, show final result screen
8. Style with CR7 orange/dark navy theme
