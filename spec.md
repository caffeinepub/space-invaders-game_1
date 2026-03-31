# Space Invaders Rebuild

## Current State
- App.tsx renders the Ronaldo penalty shootout game
- SpaceInvaders.tsx exists (1461 lines) as a separate component but is not the active main app
- Canvas-based rendering via requestAnimationFrame loop
- Both games use HTML5 Canvas for rendering

## Requested Changes (Diff)

### Add
- Full Space Invaders game as the primary app (replace Ronaldo game in App.tsx)
- Classic alien grid: 5 rows x 11 columns, 3 alien types (squid, crab, octopus)
- Player ship at bottom with left/right movement and shooting
- 4 destructible shields (pixel-level damage)
- UFO bonus target flying across the top
- HUD with score, hi-score, lives, and wave number
- Wave progression with increasing alien speed
- Animated alien sprites (2-frame animation per alien type)
- Sound effects using Web Audio API (shoot, explosion, alien march, UFO)
- Starfield background
- Start screen and game over screen
- Particle explosion effects
- Score popups on kills

### Modify
- App.tsx: replace Ronaldo football game with Space Invaders game
- SpaceInvaders.tsx: full rewrite for improved quality, correctness, and completeness

### Remove
- Ronaldo football game from App.tsx (move to unused; keep file but App.tsx points to Space Invaders)

## Implementation Plan
1. Rewrite SpaceInvaders.tsx with a clean, complete implementation using Canvas + requestAnimationFrame
2. Implement all classic game elements: alien grid, player, bullets, shields, UFO, HUD
3. Implement Web Audio API sound effects
4. Implement wave progression and difficulty scaling
5. Update App.tsx to render SpaceInvaders component fullscreen
6. Validate and fix any TypeScript/lint errors
