/* Bubble Hex levels.
 * Types: clear (pop all), rescue (free N familiars), ghost (raise ghost to top), boss (break Wilbur's shield bubbles).
 * layout: array of strings, each char = bubble color (R B G Y P), '.' = empty, 'F' = familiar (trapped), 'W' = rainbow, 'X' = bomb, '#' = blocker (unbreakable).
 * For ghost levels: ghostStart = [r,c]. For boss: shield = number of shield bubbles.
 */
'use strict';
var LEVELS = [
  { name: "First Flight", type: "clear", colors: 3, shots: 30, layout: [
    "RRRBBBG", "RRBBGGG", "BBBGGYY", "BBGYYYY", "GGYYYRR", "GYYYRRR" ] },
  { name: "Color Practice", type: "clear", colors: 3, shots: 35, layout: [
    "BBGGYYRR", "BGGYYRRB", "GGYYRRBB", "GYYRRBBG", "YYRRBBGG", "YRRBBGGY", "RRBBGGYY" ] },
  { name: "Free the Familiars", type: "rescue", colors: 3, shots: 35, need: 2, layout: [
    "RRBBGGYY", "RBBGGYYR", "BBGGFYYR", "BGGFYYRR", "GGYYRRBB", "GYYRRBBB" ] },
  { name: "Rising Spirit", type: "ghost", colors: 3, shots: 40, ghostStart: [7, 3], layout: [
    "BBGGYYRR", "BGGYYRRB", "GGYYRRBB", "GYYRRBBG", "YYRRBBGG", "YRRBBGGY", "RRBBGGYY", "RBBGGYYR" ] },
  { name: "Four Colors", type: "clear", colors: 4, shots: 40, layout: [
    "RRBBGGYYPP", "RBBGGYYPPR", "BBGGYYPPRR", "BGGYYPPRRB", "GGYYPPRRBB", "GYYPPRRBBG" ] },
  { name: "Familiar Rescue", type: "rescue", colors: 4, shots: 40, need: 3, layout: [
    "RRBBGGYYPP", "RBBGGYYPPR", "BBGFGYPPRR", "BGFGYYPPRR", "GGYYFPRRBB", "GYYPPRRBBB" ] },
  { name: "Wilbur's Minions", type: "boss", colors: 4, shots: 45, shield: 6, layout: [
    "RRBBGGYYPP", "RBBGGYYPPR", "BBGGYYPPRR", "BGGYYPPRRB", "GGYYPPRRBB", "GYYPPRRBBG", "YYPPRRBBGG" ] },
  { name: "Ghost Ascent", type: "ghost", colors: 4, shots: 45, ghostStart: [8, 5], layout: [
    "PPRRBBGGYY", "PRRBBGGYYP", "RRBBGGYYPP", "RBBGGYYPPR", "BBGGYYPPRR", "BGGYYPPRRB", "GGYYPPRRBB", "GYYPPRRBBG", "YYPPRRBBGG" ] },
  { name: "Blocker Wall", type: "clear", colors: 4, shots: 45, layout: [
    "RRBBGGYYPP", "RBBGG##PPR", "BBGGYYPPRR", "BGG##PPRRB", "GGYYPPRRBB", "GYYPPRRBBG" ] },
  { name: "Deep Rescue", type: "rescue", colors: 4, shots: 50, need: 4, layout: [
    "RRBBGGYYPP", "RBBGGYYPPR", "BBGGYYPPRR", "BGGFYPPRRB", "GGFYPPRRBB", "GYFPPRRBBG", "YFPPRRBBGG" ] },
  { name: "Five Colors", type: "clear", colors: 5, shots: 50, layout: [
    "RRBBGGYYPPR", "RBBGGYYPPRB", "BBGGYYPPRBB", "BGGYYPPRBBG", "GGYYPPRBBGG", "GYYPPRBBGGY" ] },
  { name: "Wilbur Returns", type: "boss", colors: 5, shots: 55, shield: 10, layout: [
    "RRBBGGYYPPR", "RBBGG##PPRB", "BBGGYYPPRBB", "BGG##PPRBBG", "GGYYPPRBBGG", "GYYPPRBBGGY", "YYPPRBBGGYY" ] },
  { name: "The Long Climb", type: "ghost", colors: 5, shots: 55, ghostStart: [9, 5], layout: [
    "PPRRBBGGYYR", "PRRBBGGYYRP", "RRBBGGYYRPP", "RBBGGYYRPPR", "BBGGYYRPPRR", "BGGYYRPPRRB", "GGYYRPPRRBB", "GYYRPPRRBBG", "YYRPPRRBBGG", "YRPPRRBBGGY" ] },
  { name: "Familiar Flock", type: "rescue", colors: 5, shots: 55, need: 5, layout: [
    "RRBBGGYYPPR", "RBBFGYPPRBB", "BBFGYYPRBBG", "BGFYYPRBBGG", "GFYYPRBBGGY", "FYYPRBBGGYY", "YYPRBBGGYYP" ] },
  { name: "Final Hex", type: "clear", colors: 5, shots: 60, layout: [
    "RRBBGGYYPPR", "RBBGG##PPRB", "BBGGYYPPRBB", "BG##YPPRBBG", "GGYYPPRBBGG", "GY##PRBBGGY", "YYPPRBBGGYY", "YPPRBBGGYYP" ] },
];
if (typeof module !== 'undefined') module.exports = { LEVELS: LEVELS };
if (typeof window !== 'undefined') window.HEX_LEVELS = LEVELS;
