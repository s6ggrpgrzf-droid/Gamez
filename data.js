/* Reel Empire — static game data: names, titles, genres, techs, events, dilemmas */

var GENRES = {
  western:  {name:"Western",   icon:"🤠", from:1955},
  drama:    {name:"Drama",     icon:"🎭", from:1955},
  comedy:   {name:"Comedy",    icon:"😂", from:1955},
  musical:  {name:"Musical",    icon:"🎶", from:1955},
  romance:  {name:"Romance",    icon:"💕", from:1955},
  horror:   {name:"Horror",    icon:"👻", from:1960},
  thriller: {name:"Thriller",  icon:"🔪", from:1965},
  action:   {name:"Action",    icon:"💥", from:1970},
  scifi:    {name:"Sci-Fi",    icon:"🚀", from:1972},
  fantasy:  {name:"Fantasy",   icon:"🐉", from:1980},
  animation:{name:"Animation", icon:"✨", from:1985},
  superhero:{name:"Superhero", icon:"🦸", from:2002},
};

var TECHS = [
  {id:"color",    name:"Color Film",       year:1955, cost:3,  weeks:12, desc:"+6 quality on all films. The future is bright."},
  {id:"wide",     name:"Widescreen",       year:1957, cost:4,  weeks:16, desc:"+6 quality on western, action, scifi, fantasy."},
  {id:"method",   name:"Method Acting",    year:1962, cost:5,  weeks:20, desc:"+6 quality on drama, romance, thriller."},
  {id:"auteur",   name:"Auteur Cinema",    year:1968, cost:8,  weeks:24, desc:"+6 quality on drama, thriller, horror. Critics swoon."},
  {id:"blockbuster", name:"Blockbuster Formula", year:1975, cost:14, weeks:30, desc:"+8 quality on action, scifi, fantasy, superhero. Marketing +20% effective."},
  {id:"cgi",      name:"CGI",              year:1990, cost:28, weeks:44, desc:"+10 quality on scifi, fantasy, action, superhero, animation."},
  {id:"digital",  name:"Digital Cameras",  year:2000, cost:22, weeks:32, desc:"Production costs -15%. +4 quality everywhere."},
  {id:"streaming",name:"Streaming Platform", year:2010, cost:45, weeks:52, desc:"Unlocks streaming releases: extra revenue tail on every film."},
];
var TECH_GENRES = {
  color:[], wide:["western","action","scifi","fantasy"], method:["drama","romance","thriller"],
  auteur:["drama","thriller","horror"], blockbuster:["action","scifi","fantasy","superhero"],
  cgi:["scifi","fantasy","action","superhero","animation"], digital:[], streaming:[],
};

var FIRST_NAMES_M = ["James","Robert","John","William","Charles","George","Frank","Harold","Paul","Raymond","Walter","Jack","Henry","Arthur","Earl","Roy","Clint","Burt","Steve","Marlon","Humphrey","Gary","Kirk","Tony","Lee","Chuck","Sam","Gene","Peter","Dennis","Warren","Dustin","Al","Robert","Tom","Harrison","Arnold","Sylvester","Mel","Kevin","Denzel","Brad","Leonardo","Matt","Will","George","Hugh","Russell","Joaquin","Christian","Ryan","Jake","Michael","Chris","Daniel","Oscar","Timothée","Austin","Pedro","Barry","Paul"];
var FIRST_NAMES_F = ["Mary","Patricia","Jennifer","Linda","Barbara","Susan","Jessica","Sarah","Karen","Nancy","Lisa","Betty","Margaret","Sandra","Ashley","Dorothy","Kimberly","Emily","Donna","Michelle","Carol","Amanda","Melissa","Deborah","Stephanie","Rebecca","Sharon","Laura","Cynthia","Kathryn","Amy","Shirley","Angela","Helen","Anna","Brenda","Pamela","Nicole","Emma","Olivia","Sophia","Mia","Ava","Scarlett","Natalie","Anne","Jennifer","Zendaya","Florence","Anya","Margot","Emma","Saoirse","Ariana"];
var LAST_NAMES = ["Stewart","Wayne","Cooper","Gable","Bogart","Bacall","Davis","Hepburn","Grant","Kelly","Monroe","Dean","Brando","Clift","Holden","Peck","Douglas","Lancaster","Mitchum","Widmark","Ford","Hawks","Wyler","Wilder","Hitchcock","Kazan","Zinnemann","Stevens","Leone","Eastwood","Bronson","Coburn","McQueen","Newman","Redford","Beatty","Nicholson","De Niro","Pacino","Hoffman","Hackman","Duvall","Voight","Kristofferson","Scheider","Shaw","Dreyfuss","Gossett","Baldwin","Hanks","Cruise","Willis","Schwarzenegger","Stallone","Gibson","Costner","Washington","Pitt","DiCaprio","Damon","Smith","Clooney","Jackman","Crowe","Phoenix","Bale","Gosling","Gyllenhaal","Pine","Evans","Hemsworth","Pratt","Jordan","Chalamet","Butler","Pascal","Keoghan","Mescal","Nighy","Oldman","Day-Lewis","Hopkins","Freeman","Caine","Connery","Moore","Dalton","Brosnan","Craig","Bergman","Taylor","Gardner","Hayworth","Novak","Wood","Fonda","Dunaway","Streisand","Minelli","Keaton","Field","Foster","Meryl","Close","Lange","Sarandon","Pfeiffer","Basinger","Turner","Weaver","Goldberg","Bates","Thompson","Stone","Ryan","Bullock","Moore","Kidman","Blanchett","Winslet","Portman","Theron","Berry","Witherspoon","Hathaway","Lawrence","Stone","Robbie","Pugh","Taylor-Joy","Zendaya","Anya","Sweeney","Gaga","Erivo"];
var DIRECTOR_SURNAMES = ["Ford","Hawks","Wyler","Wilder","Hitchcock","Kazan","Zinnemann","Stevens","Leone","Peckinpah","Altman","Ashby","Coppola","Scorsese","Spielberg","Lucas","De Palma","Schrader","Friedkin","Bogdanovich","Scott","Stone","Levinson","Howard","Zemeckis","Burton","Lynch","Coen","Tarantino","Anderson","Fincher","Nolan","Villeneuve","Cuarón","Iñárritu","del Toro","Bigelow","Jenkins","Gerwig","Peele","Aster","Eggers","Zhao","Chung","Hamagu","Triet","Glazer","Lantha","Gray"];

var TITLE_PARTS = {
  western:  {a:["The Last","Guns of","Ride the","Shadow of","Legend of","Dawn at","Blood on","Thunder in","The Ballad of","Six Guns for"], b:["Sunset","Dust","Thunder","Red Rock","the Rio","Laredo","the Badlands","Vengeance","the Frontier","Noon"]},
  drama:    {a:["The","A","Whispers of","The Weight of","Echoes of","The Long","Beneath","The Quiet"], b:["Tomorrow","Regret","the Rain","Silence","Autumn","Fathers","the River","Glass"]},
  comedy:   {a:["My Big","The Great","How to Lose","Dr.","The Misadventures of","Bachelor","Honey, I"], b:["Mix-Up","Vacation","Mother-in-Law","Dentist","Neighbor","Boss","Wedding","Fortune"]},
  musical:  {a:["Singin' in","Dancing on","The","Moonlight","An American in","Top Hat and"], b:["the Rain","Broadway","Paris","Melody","Serenade","Rhythm","Spotlight"]},
  romance:  {a:["Love in","A Summer of","The","Forever","Letters from","When We Were"], b:["Paris","June","Us","Young","the Vineyard","Autumn","the Heart"]},
  horror:   {a:["The","Night of the","Curse of","The Haunting of","Don't Go Into","The"], b:["Living Dead","Blackwood Manor","the Hollow","Whispers","Cellar","Fog","the Dollmaker","the Thirteenth"]},
  thriller: {a:["The","A","The Last","Dead","The Silent"], b:["Witness","Alibi","Conspiracy","Deadline","Stranger","Protocol","Confession","Vanishing"]},
  action:   {a:["Maximum","Iron","Death","Hard","Final","Zero"], b:["Justice","Fury","Reckoning","Protocol","Vengeance","Hour","Impact","Storm"]},
  scifi:    {a:["Star","The","Beyond","Echoes of","The Last","Children of"], b:["Voyager","Horizon","Tomorrow","the Void","Starlight","Andromeda","the Machine"]},
  fantasy:  {a:["The","Chronicles of","The Legend of","The","Swords of"], b:["the Ember Throne","Narnia","the Nine Realms","the Dragon","Avalon","the Moonstone"]},
  animation:{a:["The","A","The Incredible","Tales of"], b:["Toys","the Brave Little Toaster","Paws","the Enchanted Forest","Wishes","the Sky Whale"]},
  superhero:{a:["Captain","The Amazing","Iron","The Dark","Doctor"], b:["Thunder","Justice","Vengeance","the City","Tomorrow","Legacy","Rising"]},
};

var RIVAL_NAMES = ["Majestic Pictures","Crown Films","Liberty Studios"];
var RIVAL_FLAVOR = [
  "signs a three-picture deal with a hot young director",
  "announces a lavish historical epic",
  "is rumored to be developing a sci-fi franchise",
  "poaches a top agent from a rival agency",
  "opens a new sound stage complex",
  "bets big on an untested genre",
];

var WORLD_EVENTS = [
  {id:"tvboom",    name:"Television Boom", text:"Families stay home for TV. Drama and musical demand cools.", heat:{drama:-0.25, musical:-0.25}, years:[1955,1965]},
  {id:"war",       name:"War Abroad", text:"Audiences avoid war-like action; comedies offer escape.", heat:{action:-0.2, comedy:0.25}, years:[1960,1975]},
  {id:"spacerace", name:"Space Race!", text:"The nation looks to the stars. Sci-fi soars.", heat:{scifi:0.4}, years:[1957,1972]},
  {id:"recession", name:"Recession", text:"Money is tight. Cheap laughs sell; prestige pictures wait.", heat:{comedy:0.3, drama:-0.15}, years:[1958,2025]},
  {id:"summer75",  name:"Summer of the Shark", text:"A monster hit rewrites the rules. Thriller and action surge.", heat:{thriller:0.35, action:0.3}, years:[1975,1979]},
  {id:"videoboom", name:"Home Video Boom", text:"VCRs everywhere. Theatrical legs stretch longer.", legs:0.08, years:[1980,1995]},
  {id:"indiewave", name:"Indie Wave", text:"Festivals crown daring originals. Drama and horror heat up.", heat:{drama:0.25, horror:0.25}, years:[1989,1999]},
  {id:"cgirev",    name:"CGI Revolution", text:"Digital spectacle dazzles. Sci-fi, fantasy and action surge.", heat:{scifi:0.3, fantasy:0.3, action:0.2}, years:[1993,2005]},
  {id:"streamwars",name:"Streaming Wars", text:"Audiences fragment. Theatrical cools; prestige TV lures talent.", heat:{}, years:[2013,2026]},
  {id:"westernrev",name:"Western Revival", text:"A revisionist masterpiece makes westerns cool again.", heat:{western:0.45}, years:[1990,1995]},
  {id:"horrorren", name:"Horror Renaissance", text:"Smart horror dominates the conversation.", heat:{horror:0.35}, years:[2017,2026]},
  {id:"superfat",  name:"Superhero Fatigue?", text:"Critics grumble about capes. Superhero heat wobbles.", heat:{superhero:-0.2}, years:[2023,2026]},
];

var DILEMMAS = [
  {text:"Your lead actor showed up to set nursing a hangover — again.",
   choices:[
     {t:"Shut down for a week", s:"Let them recover properly.", q:2, cost:1.5, weeks:1},
     {t:"Shoot around them", s:"Use the stunt double for close-ups.", q:-4, cost:0, weeks:0},
     {t:"Fine them and push on", s:"Morale hit, schedule kept.", q:-1, cost:0, weeks:0, stress:15}]},
  {text:"A storm destroyed the outdoor set. The location is a mud pit.",
   choices:[
     {t:"Rebuild the set", s:"Do it right.", q:1, cost:3, weeks:2},
     {t:"Move to a sound stage", s:"Cheaper, but it will look it.", q:-3, cost:1, weeks:0},
     {t:"Rewrite for interiors", s:"The writers earn their pay tonight.", q:-1, cost:0.5, weeks:1}]},
  {text:"The director wants one more take. The 40th. The crew is muttering.",
   choices:[
     {t:"Give them the take", s:"Genius needs patience.", q:3, cost:0.8, weeks:0},
     {t:"Move on", s:"It's in the can. Probably.", q:-2, cost:0, weeks:0},
     {t:"Replace the director", s:"Drastic. The press will notice.", q:-6, cost:2, weeks:3, stress:20}]},
  {text:"A tabloid caught your star in a scandal. Phones are ringing.",
   choices:[
     {t:"Issue a denial", s:"Standard Hollywood.", q:0, cost:0.3, weeks:0, buzz:5},
     {t:"Lean into it", s:"Any press is good press?", q:-2, cost:0, weeks:0, buzz:12},
     {t:"Send them to rehab", s:"Classy. Expensive.", q:1, cost:1.2, weeks:2, stress:-20}]},
  {text:"The studio wants the ending changed to test better with audiences.",
   choices:[
     {t:"Shoot the new ending", s:"Crowd-pleaser.", q:-2, cost:1.5, weeks:1, buzz:6},
     {t:"Keep the bleak ending", s:"Art over commerce.", q:3, cost:0, weeks:0, buzz:-4},
     {t:"Compromise", s:"Nobody's happy, everybody's fine.", q:0, cost:0.5, weeks:0}]},
  {text:"Your cinematographer quit mid-shoot over 'creative differences.'",
   choices:[
     {t:"Hire a legend (expensive)", s:"The best cost the most.", q:4, cost:2.5, weeks:1},
     {t:"Promote the assistant", s:"Hungry and cheap.", q:-1, cost:0, weeks:0},
     {t:"Let the director shoot it", s:"What could go wrong.", q:-4, cost:0, weeks:0}]},
  {text:"The practical effect failed spectacularly — the shark looks ridiculous.",
   choices:[
     {t:"Rebuild the shark", s:"Jaws will not be a joke.", q:3, cost:2, weeks:2},
     {t:"Hide it — less is more", s:"Suggest, don't show.", q:2, cost:0, weeks:0},
     {t:"Use it anyway", s:"Camp classic? Or career ender.", q:-5, cost:0, weeks:0}]},
  {text:"Two stars refuse to share a scene after a very public feud.",
   choices:[
     {t:"Mediate a truce", s:"Champagne diplomacy.", q:1, cost:0.8, weeks:1, stress:-10},
     {t:"Shoot them separately", s:"Movie magic will stitch it.", q:-3, cost:0.5, weeks:0},
     {t:"Recast one of them", s:"Expensive. Messy.", q:-2, cost:3, weeks:2}]},
  {text:"The censors flagged three scenes. Release hangs in the balance.",
   choices:[
     {t:"Cut the scenes", s:"Play it safe.", q:-2, cost:0, weeks:0, buzz:-3},
     {t:"Fight the censors", s:"Artistic integrity!", q:2, cost:0.5, weeks:2, buzz:8},
     {t:"Release unrated", s:"Bold. Limited screens.", q:1, cost:0, weeks:0, buzz:5}]},
  {text:"A rival studio just announced the same premise for next summer.",
   choices:[
     {t:"Race them to release", s:"Crunch time.", q:-3, cost:1, weeks:-2, buzz:6},
     {t:"Delay and polish", s:"Let them go first.", q:3, cost:0.5, weeks:3, buzz:-3},
     {t:"Buy their script", s:"If you can't beat them...", q:0, cost:4, weeks:0}]},
  {text:"The child actor can't stop giggling during the dramatic climax.",
   choices:[
     {t:"Patient coaching", s:"Time is money, kid.", q:1, cost:0.4, weeks:1},
     {t:"Use the crying take", s:"Method? Sure.", q:-1, cost:0, weeks:0},
     {t:"Cut the scene", s:"Kill your darlings.", q:-3, cost:0, weeks:0}]},
  {text:"The composer delivered a score that's... avant-garde. To put it kindly.",
   choices:[
     {t:"Keep it — it's bold", s:"Critics may love it.", q:2, cost:0, weeks:0, buzz:3},
     {t:"Hire a replacement", s:"Back to the orchestra.", q:0, cost:1, weeks:1},
     {t:"Use temp music", s:"Sounds like every other film.", q:-2, cost:0, weeks:0}]},
];

var SCOUT_FLAVOR = ["a theater kid with fire","a soap actor ready for film","a stunt performer with presence","a stand-up with timing","an indie darling","a former child star, all grown up","a model who can actually act","a voice actor with range"];
