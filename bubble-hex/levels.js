/* Bubble Hex levels. */
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
    "RRBBGGYYPPR", "RBBGGYYPPRB", "BBGGKYPPRBB", "BGGYYPPRBBG", "GGYYPPRBKGG", "GYYPPRBBGGY" ] },
  { name: "Wilbur Returns", type: "boss", colors: 5, shots: 55, shield: 10, layout: [
    "RRBBGGYYPPR", "RBBGG##PPRB", "BBGGYYPPRBB", "BGG##PPRBBG", "GGYYPPRBBGG", "GYKPPRBBGGY", "YYPPRBBGGYY" ] },
  { name: "The Long Climb", type: "ghost", colors: 5, shots: 55, ghostStart: [9, 5], layout: [
    "PPRRBBGGYYR", "PRRBBGGYYRP", "RRBBGGYYRPP", "RBBGGYYRPPR", "BBGGYYRPPRR", "BGGYYRPPRRB", "GGYYRPPRRBB", "GYYRPPRRBBG", "YYRPPRRBBGG", "YRPPRRBBGGY" ] },
  { name: "Familiar Flock", type: "rescue", colors: 5, shots: 55, need: 5, layout: [
    "RRBBGGYYPPR", "RBBFGYPPRBB", "BBFGYYPRBBG", "BGFYYPRBBGG", "GFYYPRBBGGY", "FYYPRBBGGYY", "YYPRBBGGYYP" ] },
  { name: "Final Hex", type: "clear", colors: 5, shots: 60, layout: [
    "RRBBGGYYPPR", "RBBGG##PPRB", "BBGGYYPPRBB", "BG##YPPRKBG", "GGYYPPRBBGG", "GYK#PRBBGGY", "YYPPRBBGGYY", "YPPRBBGGYYP" ] },
  { name: "Hex Storm", type: "clear", colors: 5, shots: 45, layout: [
    "RRBBGGYYPPR", "RBBG##YPPRB", "BBGGYYPPRBB", "BGK#YPPRBBG", "GGYYPPRBBGG", "GY##PRBBGGY", "YYPPRBBGGYY" ] },
  { name: "Owl Storm", type: "rescue", colors: 5, shots: 45, need: 6, layout: [
    "RBBFGYPPRBB", "BBFGYYPRBBG", "BGFYYPRBBGG", "GFYYPRBBGGY", "FYYPRBBGGYY", "YYPRBBGGYYP", "YPRBBGGYYPP" ] },
  { name: "Wilbur's Wrath", type: "boss", colors: 5, shots: 50, shield: 12, layout: [
    "RRBBGGYYPPR", "RBBG##YPPRB", "BBGGYYPPRBB", "BG##YPPRKBG", "GGYYPPRBBGG", "GY##PRBBGGY", "YYPPRBBGGYY", "YPPRBBGGYYP" ] },
  { name: "Ghost in the Machine", type: "ghost", colors: 5, shots: 50, ghostStart: [9, 5], layout: [
    "PPRRBBGGYYR", "PRRB##GYYRP", "RRBBGGYYRPP", "RBBG##YRPPR", "BBGGYYRPPRR", "BGGY##RPPRB", "GGYYRPPRRBB", "GYYRPPRRBBG" ] },
  { name: "The Gauntlet", type: "clear", colors: 5, shots: 40, layout: [
    "RBBGGYYPPRB", "BBG##YPPRBB", "BGK#YPPRBBG", "GGYYPPRBBGG", "GY##PRBBGGY", "YYPPRBBGGYY", "YPPRBBGGKYP", "PPRBBGGYYPP" ] },
  { name: "Familiar Frenzy", type: "rescue", colors: 5, shots: 40, need: 7, layout: [
    "BBFGYYPRBBG", "BGFYYPRBBGG", "GFYYPRBBGGY", "FYYPRBBGGYY", "YYPRBBGGYYP", "YPRBBGGYYPP", "PRBBGGYYPPR", "RBBGGYYPPRB" ] },
  { name: "Lightning Round", type: "clear", colors: 5, shots: 35, layout: [
    "RRBBGGYYPPR", "RBBGGYYPPRB", "BBGGYYPPRBB", "BGGYYPPRBBG", "GGYYPPRBBGG" ] },
  { name: "Wilbur's Last Stand", type: "boss", colors: 5, shots: 45, shield: 15, layout: [
    "RBBG##YPPRB", "BBG##YPPRBB", "BG##YPPRBBG", "GGYYPPRBBGG", "GY##PRBBGGY", "YYPPRBBGGYY", "YPPRBBGGYYP", "PPRBBGGKYP", "PRBBGGYYPPR" ] },
  { name: "Phantom Menace", type: "ghost", colors: 5, shots: 40, ghostStart: [10, 5], layout: [
    "RRBBGGYYPPR", "RBBGGYYPPRB", "BBG##YPPRBB", "BGGYYPPRBBG", "GG##PPRBBGG", "GYYPPRBBGGY", "YYPPRBBGGYY", "YPPRBBGGYYP", "PPRBBGGYYPP", "PRBBGGYYPPR", "RBBGGYYPPRB" ] },
  { name: "Color Chaos", type: "clear", colors: 5, shots: 35, layout: [
    "RBYGPRBYGP", "BYGPRBYGPR", "YGPRBYGPRB", "GPRBYGPRBY", "PRBYGPRBYG", "RBYGPRBYGP" ] },
  { name: "The Deep Dark", type: "rescue", colors: 5, shots: 35, need: 8, layout: [
    "GPRBYGPRBY", "PRBYGPRBYG", "RBYGPRBYGP", "BYGFPRBYGP", "YGFPRBYGPR", "GFPRBYGPRB", "FPRBYGPRBY", "PRBYGPRBYG" ] },
  { name: "Hex Master", type: "clear", colors: 5, shots: 30, layout: [
    "RBBG##YPPRB", "BB##YYPPRBB", "B##YYPPRBBG", "GGYYPPRBBGG", "GY##PRBBGGY", "YY##RBBGGYY", "YPPRBBGGYYP" ] },
  { name: "Wilbur Unleashed", type: "boss", colors: 5, shots: 40, shield: 18, layout: [
    "BBG##YPPRBB", "BG##YPPRBBG", "G##YPPRBBGG", "GGYYPPRBBGG", "GY##PRBBGGY", "YY##RBBGGYY", "YPK#BBGGYYP", "PPRBBGGYYPP" ] },
  { name: "Ghost Finale", type: "ghost", colors: 5, shots: 35, ghostStart: [10, 3], layout: [
    "PRBYGPRBYG", "RBYGPRBYGP", "BYGPRBYGPR", "YGPRBYGPRB", "GPRBYGPRBY", "PRBYGPRBYG", "RBYGPRBYGP", "BYGPRBYGPR", "YGPRBYGPRB", "GPRBYGPRBY", "PRBYGPRBYG" ] },
  { name: "The Final Hex", type: "clear", colors: 5, shots: 30, layout: [
    "R##GGYYPPRB", "##GGYYPPRBB", "BG##YPPRBBG", "GG##PPRBBGG", "GY##PRBBGGY", "YY##RBBGGYY", "YPPRBBGGYYP", "PPRBBGGYYPP" ] },
];
if (typeof module !== 'undefined') module.exports = { LEVELS: LEVELS };
if (typeof window !== 'undefined') window.HEX_LEVELS = LEVELS;
