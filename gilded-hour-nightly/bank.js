/* The Gilded Hour — the hand-authored question bank, copied from
 * the game (~/workspace/gilded-hour/questions.js, where it is
 * exposed as window.GH_BANK) into module form for the nightly
 * worker. The entries are byte-faithful: same order, same fields,
 * same values — test/test-nightly.js deep-compares this copy
 * against the game file at test time, so any drift fails loudly.
 *
 * Entry shape (the game's own): { cat, diff, q, a, w, why, kind? }
 *   a    — the correct answer (a string, not an array)
 *   w    — the three wrong answers
 *   kind — absent for ordinary questions; "num" entries carry
 *          { q, num, why } instead of a/w; "survey" entries use
 *          the ordinary a/w shape.
 * If the game bank changes, regenerate this file from it and let
 * the test prove the copy is faithful again. */
export const BANK = [
  {
    "cat": "Movies",
    "diff": "easy",
    "q": "In Forrest Gump, Forrest says life is like a box of what?",
    "a": "Chocolates",
    "w": [
      "Crayons",
      "Roses",
      "Letters"
    ],
    "why": "'Mama always said life was like a box of chocolates. You never know what you're gonna get.'"
  },
  {
    "cat": "Movies",
    "diff": "easy",
    "q": "Arnold Schwarzenegger's famous one-line promise in The Terminator is what?",
    "a": "I'll be back",
    "w": [
      "Yippee-ki-yay",
      "Go ahead, make my day",
      "Here's looking at you, kid"
    ],
    "why": "The other lines belong to John McClane, Dirty Harry and Rick Blaine."
  },
  {
    "cat": "Movies",
    "diff": "easy",
    "q": "Which 1982 Steven Spielberg film is about a boy who befriends a stranded alien who wants to phone home?",
    "a": "E.T. the Extra-Terrestrial",
    "w": [
      "Close Encounters of the Third Kind",
      "The Goonies",
      "Gremlins"
    ],
    "why": "E.T. (1982) was produced by Spielberg; he directed Close Encounters and produced the other two."
  },
  {
    "cat": "Movies",
    "diff": "easy",
    "q": "In Back to the Future, Doc Brown builds his time machine out of which car?",
    "a": "A DeLorean",
    "w": [
      "A Corvette",
      "A Trans Am",
      "A Cadillac"
    ],
    "why": "The DeLorean DMC-12, fitted with a flux capacitor, needs 1.21 gigawatts."
  },
  {
    "cat": "Movies",
    "diff": "medium",
    "q": "In Pulp Fiction, Jules explains that in Paris a Quarter Pounder with Cheese is called what?",
    "a": "A Royale with Cheese",
    "w": [
      "Le Big Mac",
      "A Quarter Pounder Royale",
      "Le Royal Cheese"
    ],
    "why": "'They call it a Royale with Cheese' — because of the metric system."
  },
  {
    "cat": "Movies",
    "diff": "medium",
    "q": "What species is the first dinosaur the visitors see rearing up in Jurassic Park?",
    "a": "Brachiosaurus",
    "w": [
      "Triceratops",
      "Velociraptor",
      "Stegosaurus"
    ],
    "why": "The Brachiosaurus reveal is the 'Welcome to Jurassic Park' moment."
  },
  {
    "cat": "Movies",
    "diff": "medium",
    "q": "Who directed The Terminator, Titanic and Avatar?",
    "a": "James Cameron",
    "w": [
      "Steven Spielberg",
      "Ridley Scott",
      "Robert Zemeckis"
    ],
    "why": "Cameron directed all three; Titanic and Avatar were each the highest-grossing film of their time."
  },
  {
    "cat": "Movies",
    "diff": "medium",
    "q": "In The Shawshank Redemption, Andy escapes through a tunnel hidden behind what in his cell?",
    "a": "A movie poster",
    "w": [
      "A bookshelf",
      "A locker",
      "A painting"
    ],
    "why": "The poster — Raquel Welch by the end — covers the hole Andy dug with a rock hammer."
  },
  {
    "cat": "Movies",
    "diff": "hard",
    "q": "In Raiders of the Lost Ark, Indiana Jones teaches archaeology at which fictional college?",
    "a": "Marshall College",
    "w": [
      "Barnett College",
      "Yale University",
      "Miskatonic University"
    ],
    "why": "Marshall College appears in Raiders and Crystal Skull; Barnett College is in The Last Crusade."
  },
  {
    "cat": "Movies",
    "diff": "hard",
    "q": "In Die Hard, John McClane's wife Holly works for which corporation, whose tower is attacked?",
    "a": "The Nakatomi Corporation",
    "w": [
      "Weyland-Yutani",
      "Umbrella Corporation",
      "Cyberdyne Systems"
    ],
    "why": "The other three are the fictional companies of Alien, Resident Evil and The Terminator."
  },
  {
    "cat": "Movies",
    "diff": "hard",
    "q": "Which film won the Academy Award for Best Picture for 1993, beating The Fugitive and The Piano?",
    "a": "Schindler's List",
    "w": [
      "The Remains of the Day",
      "In the Name of the Father",
      "Philadelphia"
    ],
    "why": "Spielberg's Schindler's List won Best Picture at the March 1994 ceremony honouring 1993 films."
  },
  {
    "cat": "Movies",
    "diff": "hard",
    "q": "The Ghostbusters' converted 1959 Cadillac ambulance is known by what name?",
    "a": "The Ecto-1",
    "w": [
      "The Ecto-2",
      "The P.K.E. Mobile",
      "The Containment Unit"
    ],
    "why": "The Ecto-1 is a 1959 Cadillac Miller-Meteor; the Containment Unit is where the ghosts are stored."
  },
  {
    "cat": "TV",
    "diff": "easy",
    "q": "On Friends, what is the name of the coffee house where the gang hangs out?",
    "a": "Central Perk",
    "w": [
      "The Daily Grind",
      "Café Nervosa",
      "The Brew House"
    ],
    "why": "Café Nervosa is Frasier's coffee shop in Seattle; Central Perk is in Greenwich Village."
  },
  {
    "cat": "TV",
    "diff": "easy",
    "q": "On The Simpsons, what does Homer exclaim when he makes a mistake?",
    "a": "D'oh!",
    "w": [
      "Ay, caramba!",
      "Excellent…",
      "Hi-diddly-ho!"
    ],
    "why": "'Ay, caramba!' is Bart's, 'Excellent…' is Mr. Burns, and 'Hi-diddly-ho!' belongs to Ned Flanders."
  },
  {
    "cat": "TV",
    "diff": "easy",
    "q": "Which rumpled TV detective in a beige raincoat always had 'just one more thing' to ask?",
    "a": "Columbo",
    "w": [
      "Kojak",
      "Magnum",
      "Rockford"
    ],
    "why": "Lieutenant Columbo, played by Peter Falk, ran in heavy reruns through the cohort's childhood."
  },
  {
    "cat": "TV",
    "diff": "easy",
    "q": "On Seinfeld, which neighbour of Jerry's is famous for his wild sliding entrances?",
    "a": "Kramer",
    "w": [
      "George",
      "Newman",
      "Frank"
    ],
    "why": "Cosmo Kramer, played by Michael Richards, lived across the hall at 129 West 81st Street."
  },
  {
    "cat": "TV",
    "diff": "medium",
    "q": "On Frasier, what is the name of Frasier Crane's equally pompous younger brother?",
    "a": "Niles",
    "w": [
      "Martin",
      "Bulldog",
      "Gil"
    ],
    "why": "Niles Crane, played by David Hyde Pierce; Martin is their father, a retired cop."
  },
  {
    "cat": "TV",
    "diff": "medium",
    "q": "Which 1990s drama follows FBI agents Mulder and Scully investigating paranormal cases?",
    "a": "The X-Files",
    "w": [
      "Millennium",
      "Twin Peaks",
      "Dark Skies"
    ],
    "why": "Millennium was X-Files creator Chris Carter's other 90s series; the truth is out there."
  },
  {
    "cat": "TV",
    "diff": "medium",
    "q": "On Married… with Children, what is Al Bundy's proudest high-school achievement?",
    "a": "Scoring four touchdowns in one game",
    "w": [
      "Winning a state wrestling title",
      "Being voted homecoming king",
      "Earning a football scholarship"
    ],
    "why": "Al never lets anyone forget his four-touchdown game for Polk High."
  },
  {
    "cat": "TV",
    "diff": "medium",
    "q": "Buffy the Vampire Slayer is set in which fictional California town, built over a Hellmouth?",
    "a": "Sunnydale",
    "w": [
      "Smallville",
      "Stars Hollow",
      "Neptune"
    ],
    "why": "Smallville is Superman's town, Stars Hollow is Gilmore Girls', and Neptune is Veronica Mars'."
  },
  {
    "cat": "TV",
    "diff": "hard",
    "q": "In the final episode of M*A*S*H, B.J. arranges stones on the ground to spell out what word, seen from the air?",
    "a": "GOODBYE",
    "w": [
      "FAREWELL",
      "AMEN",
      "PEACE"
    ],
    "why": "The 1983 finale was titled 'Goodbye, Farewell and Amen' — still one of the most-watched broadcasts ever."
  },
  {
    "cat": "TV",
    "diff": "hard",
    "q": "ER is set in the emergency room of which fictional Chicago hospital?",
    "a": "County General",
    "w": [
      "Chicago Hope",
      "St. Eligius",
      "Mercy Hospital"
    ],
    "why": "Chicago Hope was CBS's rival medical drama; St. Eligius was the hospital in St. Elsewhere."
  },
  {
    "cat": "TV",
    "diff": "hard",
    "q": "David Lynch co-created Twin Peaks with which writer-producer?",
    "a": "Mark Frost",
    "w": [
      "David Chase",
      "Chris Carter",
      "J.J. Abrams"
    ],
    "why": "Frost and Lynch created the show together; Frost also co-wrote many episodes."
  },
  {
    "cat": "TV",
    "diff": "hard",
    "q": "On NewsRadio, the all-news radio station where the staff works has which call letters?",
    "a": "WNYX",
    "w": [
      "WKRP",
      "KACL",
      "WJM"
    ],
    "why": "KACL is Frasier's station, WKRP is in Cincinnati, and WJM employed Mary Richards."
  },
  {
    "cat": "Music",
    "diff": "easy",
    "q": "Which grunge band, fronted by Kurt Cobain, released Nevermind in 1991?",
    "a": "Nirvana",
    "w": [
      "Pearl Jam",
      "Soundgarden",
      "Alice in Chains"
    ],
    "why": "Nevermind's 'Smells Like Teen Spirit' knocked Michael Jackson off the top of the charts."
  },
  {
    "cat": "Music",
    "diff": "easy",
    "q": "Which boy band sang the 1999 hit 'I Want It That Way'?",
    "a": "Backstreet Boys",
    "w": [
      "*NSYNC",
      "98 Degrees",
      "New Kids on the Block"
    ],
    "why": "'I Want It That Way' was the lead single from Backstreet Boys' Millennium."
  },
  {
    "cat": "Music",
    "diff": "easy",
    "q": "Which rapper's 1990 hit 'Ice Ice Baby' opens with 'Yo, VIP, let's kick it'?",
    "a": "Vanilla Ice",
    "w": [
      "MC Hammer",
      "Snow",
      "Marky Mark"
    ],
    "why": "'Ice Ice Baby' was the first hip-hop single to top the Billboard Hot 100."
  },
  {
    "cat": "Music",
    "diff": "easy",
    "q": "Which Michael Jackson song's video features a graveyard full of dancing zombies?",
    "a": "Thriller",
    "w": [
      "Beat It",
      "Billie Jean",
      "Bad"
    ],
    "why": "The 14-minute Thriller video, directed by John Landis, premiered on MTV in December 1983."
  },
  {
    "cat": "Music",
    "diff": "medium",
    "q": "Green Day's 1994 breakthrough album, featuring 'Basket Case' and 'When I Come Around', is titled what?",
    "a": "Dookie",
    "w": [
      "Insomniac",
      "Nimrod",
      "Kerplunk"
    ],
    "why": "Dookie was Green Day's major-label debut; Insomniac and Nimrod followed it."
  },
  {
    "cat": "Music",
    "diff": "medium",
    "q": "TLC's hit 'Waterfalls' appears on which 1994 album?",
    "a": "CrazySexyCool",
    "w": [
      "Oooooooh… On the TLC Tip",
      "FanMail",
      "3D"
    ],
    "why": "CrazySexyCool also gave TLC 'Creep' and 'Red Light Special'; FanMail came five years later."
  },
  {
    "cat": "Music",
    "diff": "medium",
    "q": "Which Spanish duo had a massive 1996 hit with the dance craze 'Macarena'?",
    "a": "Los del Río",
    "w": [
      "Gipsy Kings",
      "Los Lobos",
      "Julio Iglesias"
    ],
    "why": "The Bayside Boys remix of Los del Río's 'Macarena' spent 14 weeks at number one in the US."
  },
  {
    "cat": "Music",
    "diff": "medium",
    "q": "Who sang 'My Heart Will Go On', the theme from Titanic?",
    "a": "Celine Dion",
    "w": [
      "Whitney Houston",
      "Mariah Carey",
      "Barbra Streisand"
    ],
    "why": "Dion's recording became one of the best-selling singles of all time."
  },
  {
    "cat": "Music",
    "diff": "hard",
    "q": "Before Pearl Jam, Stone Gossard and Jeff Ament played in which Seattle band, fronted by Andrew Wood?",
    "a": "Mother Love Bone",
    "w": [
      "Temple of the Dog",
      "Mad Season",
      "Mudhoney"
    ],
    "why": "After Wood's death in 1990, Gossard and Ament formed Pearl Jam; Temple of the Dog was the tribute project."
  },
  {
    "cat": "Music",
    "diff": "hard",
    "q": "What was the very first music video played when MTV launched on 1 August 1981?",
    "a": "Video Killed the Radio Star",
    "w": [
      "Money for Nothing",
      "Take On Me",
      "Thriller"
    ],
    "why": "MTV signed on just after midnight with The Buggles' 'Video Killed the Radio Star'."
  },
  {
    "cat": "Music",
    "diff": "hard",
    "q": "Dr. Dre's landmark 1992 solo debut album, the record that defined G-funk, is titled what?",
    "a": "The Chronic",
    "w": [
      "Doggystyle",
      "The Slim Shady LP",
      "All Eyez on Me"
    ],
    "why": "Doggystyle was Snoop Dogg's Dre-produced debut a year later; The Chronic came first."
  },
  {
    "cat": "Music",
    "diff": "hard",
    "q": "Which British band made the 1997 album OK Computer, regularly ranked among the greatest ever recorded?",
    "a": "Radiohead",
    "w": [
      "Blur",
      "Oasis",
      "Pulp"
    ],
    "why": "OK Computer beat its Britpop rivals Blur, Oasis and Pulp into the all-time lists."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "easy",
    "q": "Nike's famous three-word slogan, introduced in 1988, is what?",
    "a": "Just Do It",
    "w": [
      "Impossible Is Nothing",
      "Bo Knows",
      "There Is No Finish Line"
    ],
    "why": "'Just Do It' debuted in 1988; 'Impossible Is Nothing' was Adidas, and 'Bo Knows' was a Nike campaign, not the slogan."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "easy",
    "q": "Which fast-food chain asked 'Where's the beef?' in a famous 1984 commercial?",
    "a": "Wendy's",
    "w": [
      "McDonald's",
      "Burger King",
      "Arby's"
    ],
    "why": "Clara Peller's demand for a bigger burger made Wendy's ad one of the most quoted of the decade."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "easy",
    "q": "The Energizer Bunny 'keeps going and going and going' — what product does it advertise?",
    "a": "Batteries",
    "w": [
      "Tyres",
      "Motor oil",
      "Running shoes"
    ],
    "why": "The drumming bunny, a parody of a Duracell ad, has marched for Energizer since 1989."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "easy",
    "q": "'I don't wanna grow up, I'm a ___ kid' — which toy retailer sang that jingle?",
    "a": "Toys 'R' Us",
    "w": [
      "KB Toys",
      "FAO Schwarz",
      "Child World"
    ],
    "why": "Generations of Toys 'R' Us kids grew up — the chain closed its US stores in 2018."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "medium",
    "q": "Which coffee brand's jingle promises 'The best part of wakin' up… in your cup'?",
    "a": "Folgers",
    "w": [
      "Maxwell House",
      "Sanka",
      "Taster's Choice"
    ],
    "why": "Maxwell House's line was 'Good to the last drop'; Folgers owns the morning."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "medium",
    "q": "In McDonald's 'The Showdown' ad, Michael Jordan and Larry Bird play an impossible game of H-O-R-S-E to win which sandwich?",
    "a": "The Big Mac",
    "w": [
      "The Quarter Pounder",
      "The Arch Deluxe",
      "The Big N' Tasty"
    ],
    "why": "The 1993 Super Bowl spot ended 'Nothing but net' — the prize was a Big Mac and fries."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "medium",
    "q": "Which soda's Christmas ads feature a family of polar bears watching the Northern Lights?",
    "a": "Coca-Cola",
    "w": [
      "Pepsi",
      "Dr Pepper",
      "Snapple"
    ],
    "why": "Coke's animated polar bears debuted in 1993 and became a holiday fixture."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "medium",
    "q": "'Sometimes you feel like a nut, sometimes you don't' — according to the jingle, which candy bar HAS nuts?",
    "a": "Almond Joy",
    "w": [
      "Mounds",
      "Snickers",
      "PayDay"
    ],
    "why": "'Almond Joy's got nuts, Mounds don't' — the two bars shared one famous jingle."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "hard",
    "q": "Apple's famous 1984 Super Bowl ad, directed by Ridley Scott, cast Big Brother from which dystopian novel?",
    "a": "Nineteen Eighty-Four",
    "w": [
      "Brave New World",
      "Fahrenheit 451",
      "A Clockwork Orange"
    ],
    "why": "The ad promised '1984 won't be like 1984' as it launched the Macintosh."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "hard",
    "q": "Which beer brand's ads had friends answering the phone by shouting 'Whassup?!'",
    "a": "Budweiser",
    "w": [
      "Bud Light",
      "Coors Light",
      "Miller Lite"
    ],
    "why": "Budweiser's 'Whassup?!' campaign, from its 'True' series, broke in late 1999."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "hard",
    "q": "In the classic Tootsie Pop cartoon ad, Mr. Owl says it takes how many licks to get to the centre?",
    "a": "Three",
    "w": [
      "One",
      "Two",
      "Four"
    ],
    "why": "'One… two… three — *crunch*. Three.' The ad ran for decades after its 1970 debut."
  },
  {
    "cat": "Ads & Jingles",
    "diff": "hard",
    "q": "'Be a Pepper' — the 'I'm a Pepper' jingle invited everyone to drink which soda?",
    "a": "Dr Pepper",
    "w": [
      "Mr. Pibb",
      "RC Cola",
      "Shasta"
    ],
    "why": "David Naughton sang and danced the Pepper jingle from the late 1970s into the 80s."
  },
  {
    "cat": "Toys & Games",
    "diff": "easy",
    "q": "Which Nintendo handheld, launched in North America in 1989 and bundled with Tetris, played games on cartridges?",
    "a": "Game Boy",
    "w": [
      "Game Gear",
      "Atari Lynx",
      "TurboExpress"
    ],
    "why": "Sega's Game Gear and the Atari Lynx had colour screens; the Game Boy's battery life won the war."
  },
  {
    "cat": "Toys & Games",
    "diff": "easy",
    "q": "Which furry electronic toy of 1998 babbled in its own language, Furbish, until it learned English?",
    "a": "Furby",
    "w": [
      "Tamagotchi",
      "Giga Pet",
      "Tickle Me Elmo"
    ],
    "why": "Furby was 1998's must-have toy; some offices and agencies banned it for 'listening'."
  },
  {
    "cat": "Toys & Games",
    "diff": "easy",
    "q": "In the board game Candy Land, players race along the rainbow path to reach which destination?",
    "a": "Candy Castle",
    "w": [
      "Gumdrop Mountain",
      "Lollipop Woods",
      "Peppermint Forest"
    ],
    "why": "Candy Castle is King Kandy's home; the others are stops along the way."
  },
  {
    "cat": "Toys & Games",
    "diff": "easy",
    "q": "Which twisting 3-D puzzle cube became a worldwide craze after its 1980 US launch?",
    "a": "Rubik's Cube",
    "w": [
      "Simon",
      "Pyraminx",
      "Magic 8 Ball"
    ],
    "why": "Ernő Rubik's cube has over 43 quintillion possible positions."
  },
  {
    "cat": "Toys & Games",
    "diff": "medium",
    "q": "Which Nintendo 64 launch game in 1996 had Mario exploring Princess Peach's castle in 3-D for the first time?",
    "a": "Super Mario 64",
    "w": [
      "Mario Kart 64",
      "GoldenEye 007",
      "The Legend of Zelda: Ocarina of Time"
    ],
    "why": "Super Mario 64 launched with the N64 in 1996; the others arrived in 1997 and 1998."
  },
  {
    "cat": "Toys & Games",
    "diff": "medium",
    "q": "What was Sony's first home games console, launched in North America in September 1995?",
    "a": "PlayStation",
    "w": [
      "Sega Saturn",
      "Nintendo 64",
      "3DO"
    ],
    "why": "The PlayStation beat Sega's Saturn to market in the US and won the CD generation."
  },
  {
    "cat": "Toys & Games",
    "diff": "medium",
    "q": "Which keychain-sized virtual pet from Bandai had to be fed and cleaned up after, or it would die?",
    "a": "Tamagotchi",
    "w": [
      "Giga Pet",
      "Nano Baby",
      "Furby"
    ],
    "why": "Tamagotchi hatched in Japan in 1996 and reached the US in 1997; Giga Pet was Tiger's rival."
  },
  {
    "cat": "Toys & Games",
    "diff": "medium",
    "q": "In The Legend of Zelda (1986), the old man in the first cave hands Link which weapon, saying 'It's dangerous to go alone'?",
    "a": "A wooden sword",
    "w": [
      "A bow",
      "A boomerang",
      "A shield"
    ],
    "why": "'It's dangerous to go alone! Take this.' — the wooden sword starts the adventure."
  },
  {
    "cat": "Toys & Games",
    "diff": "hard",
    "q": "Which 1982 Atari game sold so badly that truckloads of unsold cartridges were buried in a New Mexico landfill?",
    "a": "E.T. the Extra-Terrestrial",
    "w": [
      "Pac-Man",
      "Custer's Revenge",
      "Superman"
    ],
    "why": "Atari buried E.T. cartridges in Alamogordo in 1983; the site was excavated in 2014 and the legend proved true."
  },
  {
    "cat": "Toys & Games",
    "diff": "hard",
    "q": "In the school computer-lab classic The Oregon Trail, your party members most famously died of which disease?",
    "a": "Dysentery",
    "w": [
      "Cholera",
      "Typhoid fever",
      "Measles"
    ],
    "why": "'You have died of dysentery' became one of gaming's most quoted lines."
  },
  {
    "cat": "Toys & Games",
    "diff": "hard",
    "q": "The early NES Deluxe Set came bundled with which robotic accessory, meant to make the console look like a toy?",
    "a": "R.O.B.",
    "w": [
      "The Power Glove",
      "The Zapper",
      "The NES Advantage"
    ],
    "why": "R.O.B., the Robotic Operating Buddy, helped Nintendo sell the NES to wary US stores after the 1983 crash."
  },
  {
    "cat": "Toys & Games",
    "diff": "hard",
    "q": "Which doll line caused the great Christmas toy riots of 1983, as parents fought over shortages in stores?",
    "a": "Cabbage Patch Kids",
    "w": [
      "My Little Pony",
      "Strawberry Shortcake",
      "Rainbow Brite"
    ],
    "why": "The 1983 Cabbage Patch frenzy was the original holiday toy shortage stampede."
  },
  {
    "cat": "Saturday Morning",
    "diff": "easy",
    "q": "Which cartoon stars four pizza-loving turtle brothers: Leonardo, Donatello, Michelangelo and Raphael?",
    "a": "Teenage Mutant Ninja Turtles",
    "w": [
      "Battletoads",
      "Biker Mice from Mars",
      "Street Sharks"
    ],
    "why": "Battletoads, Biker Mice and Street Sharks were all riding the Turtles' wave."
  },
  {
    "cat": "Saturday Morning",
    "diff": "easy",
    "q": "In Scooby-Doo, the gang solves mysteries while travelling in a painted van called what?",
    "a": "The Mystery Machine",
    "w": [
      "The Mystery Van",
      "The Groovy Wagon",
      "The Phantom Finder"
    ],
    "why": "The Mystery Machine's flower-power paint job is pure 1969, rerun forever."
  },
  {
    "cat": "Saturday Morning",
    "diff": "easy",
    "q": "In DuckTales, which billionaire duck takes swimming dives into his own money bin?",
    "a": "Scrooge McDuck",
    "w": [
      "Donald Duck",
      "Flintheart Glomgold",
      "Magica De Spell"
    ],
    "why": "Glomgold is Scrooge's rival and Magica his nemesis; the money bin is Scrooge's."
  },
  {
    "cat": "Saturday Morning",
    "diff": "easy",
    "q": "Which cartoon's lion-led heroes answer the call by shouting 'Thunder… Thunder… ThunderCats, ho!'?",
    "a": "ThunderCats",
    "w": [
      "SilverHawks",
      "Voltron",
      "TigerSharks"
    ],
    "why": "SilverHawks and TigerSharks came from the same studio, Rankin/Bass."
  },
  {
    "cat": "Saturday Morning",
    "diff": "medium",
    "q": "In Chip 'n Dale: Rescue Rangers, which character is the team's inventive pilot and mechanic?",
    "a": "Gadget Hackwrench",
    "w": [
      "Zipper",
      "Monterey Jack",
      "Fat Cat"
    ],
    "why": "Gadget builds the Ranger Wing; Monterey Jack is the strongman, Zipper the fly, Fat Cat the villain."
  },
  {
    "cat": "Saturday Morning",
    "diff": "medium",
    "q": "Which cartoon hero introduces himself as 'the terror that flaps in the night'?",
    "a": "Darkwing Duck",
    "w": [
      "TaleSpin's Baloo",
      "DuckTales' Launchpad",
      "Goof Troop's Goofy"
    ],
    "why": "Darkwing Duck, Disney's caped parody, premiered in 1991 on The Disney Afternoon."
  },
  {
    "cat": "Saturday Morning",
    "diff": "medium",
    "q": "In the Animaniacs segments, Pinky and the Brain are genetically altered what?",
    "a": "Laboratory mice",
    "w": [
      "Laboratory rats",
      "Laboratory hamsters",
      "Laboratory gerbils"
    ],
    "why": "Two lab mice at Acme Labs, plotting nightly to take over the world."
  },
  {
    "cat": "Saturday Morning",
    "diff": "medium",
    "q": "In Captain Planet and the Planeteers, Ma-Ti's ring wields which fifth power, alongside Earth, Fire, Wind and Water?",
    "a": "Heart",
    "w": [
      "Love",
      "Light",
      "Spirit"
    ],
    "why": "Ma-Ti's Heart ring — the one every playground argued about."
  },
  {
    "cat": "Saturday Morning",
    "diff": "hard",
    "q": "Which Batman: The Animated Series character was created for the show in 1992 and later adopted into the comics?",
    "a": "Harley Quinn",
    "w": [
      "Poison Ivy",
      "Catwoman",
      "Talia al Ghul"
    ],
    "why": "Harley Quinn debuted on the animated series and proved so popular DC put her in the comics."
  },
  {
    "cat": "Saturday Morning",
    "diff": "hard",
    "q": "In the 1983 Dungeons & Dragons cartoon, the kids are given riddling guidance by which small, mysterious mentor?",
    "a": "The Dungeon Master",
    "w": [
      "Venger",
      "The Shadow Demon",
      "The Beholder"
    ],
    "why": "Venger, the one-horned villain, is the one trying to steal their weapons."
  },
  {
    "cat": "Saturday Morning",
    "diff": "hard",
    "q": "G.I. Joe's end-of-episode safety lessons always ended: '…and knowing is…?' what?",
    "a": "Half the battle",
    "w": [
      "The whole war",
      "What counts",
      "Everything"
    ],
    "why": "'…and knowing is half the battle!' — G.I. Joe, a real American sign-off."
  },
  {
    "cat": "Saturday Morning",
    "diff": "hard",
    "q": "Which 1980s cartoon starred Jerrica Benton, a music executive who became a pop star via holographic earrings from a computer called Synergy?",
    "a": "Jem",
    "w": [
      "Rainbow Brite",
      "She-Ra",
      "My Little Pony"
    ],
    "why": "Jem and the Holograms — truly outrageous, and Mattel's answer to Barbie's rock years."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "easy",
    "q": "Which online service flooded America's mailboxes with free-trial CDs and floppy disks through the 1990s?",
    "a": "AOL",
    "w": [
      "Prodigy",
      "CompuServe",
      "NetZero"
    ],
    "why": "AOL's carpet-bombed trial discs are now museum pieces; Prodigy and CompuServe were its older rivals."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "easy",
    "q": "What three words did AOL announce when new email arrived?",
    "a": "You've got mail",
    "w": [
      "Mail call!",
      "Incoming message!",
      "Ding! You have mail"
    ],
    "why": "The voice was Elwood Edwards, who recorded the greeting in 1989."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "easy",
    "q": "Which video rental chain's blue-and-yellow stores asked customers to 'Be Kind, Rewind'?",
    "a": "Blockbuster",
    "w": [
      "Hollywood Video",
      "Movie Gallery",
      "Family Video"
    ],
    "why": "Blockbuster peaked at over 9,000 stores; late fees were its most feared feature."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "easy",
    "q": "A dial-up connection screeched and beeped while connecting through which piece of hardware?",
    "a": "A modem",
    "w": [
      "A router",
      "A fax machine",
      "A printer"
    ],
    "why": "The modem's handshake song meant someone was about to pick up the phone and kill your download."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "medium",
    "q": "Google's name is a play on 'googol' — what is a googol?",
    "a": "1 followed by 100 zeros",
    "w": [
      "1 followed by 10 zeros",
      "A million million",
      "The largest prime number"
    ],
    "why": "Founders Page and Brin misspelled 'googol' when naming the company in 1998."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "medium",
    "q": "Napster, launched in 1999 by Shawn Fanning, let users share which kind of file for free?",
    "a": "MP3s",
    "w": [
      "JPEGs",
      "PDFs",
      "ZIP files"
    ],
    "why": "Napster's MP3 sharing terrified the record industry; courts shut it down in 2001."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "medium",
    "q": "Which Motorola flip phone, launched in 2004, was famous for being razor-thin?",
    "a": "The Razr",
    "w": [
      "The StarTAC",
      "The Nokia 3310",
      "The Sidekick"
    ],
    "why": "The Razr V3 sold over 100 million units; the StarTAC was 1996's flip pioneer."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "medium",
    "q": "On MySpace, every new user's first friend was which co-founder?",
    "a": "Tom Anderson",
    "w": [
      "Mark Zuckerberg",
      "Jack Dorsey",
      "Steve Chen"
    ],
    "why": "'Tom from MySpace' — his smiling photo was the default first friend from 2003 on."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "hard",
    "q": "The world's first famous webcam, set up in 1991, let researchers check the level of what before walking down the hall?",
    "a": "A coffee pot",
    "w": [
      "A water cooler",
      "A printer tray",
      "A vending machine"
    ],
    "why": "Cambridge's Trojan Room coffee pot camera went on the web in 1993 and drew millions of visitors."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "hard",
    "q": "The Pilot 1000 and 5000, the 1996 organizers that launched the PDA era, were made by which company?",
    "a": "Palm Computing",
    "w": [
      "Handspring",
      "Psion",
      "Sharp"
    ],
    "why": "Palm Computing, then part of U.S. Robotics; Handspring was founded later by Palm's founders."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "hard",
    "q": "Which post-Napster file-sharing network, launched in 2000, was named after a donkey?",
    "a": "eDonkey2000",
    "w": [
      "Kazaa",
      "LimeWire",
      "Morpheus"
    ],
    "why": "eDonkey2000, Kazaa and LimeWire fought over Napster's orphaned users."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "hard",
    "q": "Which 1993 web browser first made the web graphical — pictures alongside text — and popular with the public?",
    "a": "Mosaic",
    "w": [
      "Netscape Navigator",
      "Lynx",
      "Internet Explorer"
    ],
    "why": "NCSA Mosaic came first; its creators went on to build Netscape Navigator in 1994."
  },
  {
    "cat": "TV",
    "diff": "easy",
    "kind": "num",
    "q": "How many episodes of Friends were there, across all ten seasons?",
    "num": 236,
    "why": "236 episodes, 1994 to 2004 — and yes, somebody at this table has seen all of them twice."
  },
  {
    "cat": "Movies",
    "diff": "medium",
    "kind": "num",
    "q": "How many minutes long is Titanic, bow to stern?",
    "num": 194,
    "why": "194 minutes — three hours and fourteen. The iceberg gets about four of them."
  },
  {
    "cat": "Music",
    "diff": "medium",
    "kind": "num",
    "q": "How many weeks did the Macarena sit at number one in America?",
    "num": 14,
    "why": "Fourteen weeks at the top in 1996. The dance outlasted the summer, the year, and several governments."
  },
  {
    "cat": "Toys & Games",
    "diff": "hard",
    "kind": "num",
    "q": "How many stickers are there on a Rubik's Cube, counting every square on all six faces?",
    "num": 54,
    "why": "Nine per face, six faces — 54. Knowing that solves nothing, but it impresses people."
  },
  {
    "cat": "Saturday Morning",
    "diff": "easy",
    "kind": "num",
    "q": "How many members are in Mystery Inc, counting Scooby-Doo himself?",
    "num": 5,
    "why": "Fred, Daphne, Velma, Shaggy and Scooby — five, and the dog does most of the running."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "hard",
    "kind": "num",
    "q": "At its peak, to the nearest thousand, how many Blockbuster stores were there in the world?",
    "num": 9000,
    "why": "Over 9,000 stores at the 2004 peak — and every single one of them wanted its tapes rewound."
  },
  {
    "cat": "Movies",
    "diff": "easy",
    "kind": "survey",
    "q": "Ask a roomful of grown-ups to name the greatest film ever made, and the answer that comes up most is…",
    "a": "The Godfather",
    "w": [
      "Star Wars",
      "The Shawshank Redemption",
      "Jaws"
    ],
    "why": "The Godfather tops critics' and readers' all-time polls decade after decade — it's the answer the room reaches for."
  },
  {
    "cat": "TV",
    "diff": "medium",
    "kind": "survey",
    "q": "The TV theme most people say they can still sing along to, word for word, is the one from…",
    "a": "Cheers",
    "w": [
      "Friends",
      "The Simpsons",
      "Seinfeld"
    ],
    "why": "'Where everybody knows your name' — the Cheers theme is the one the whole room can hum."
  },
  {
    "cat": "Music",
    "diff": "medium",
    "kind": "survey",
    "q": "The song most people claim they know every single word to is…",
    "a": "Bohemian Rhapsody",
    "w": [
      "Sweet Caroline",
      "Don't Stop Believin'",
      "Livin' on a Prayer"
    ],
    "why": "Queen's six-minute mini-opera — everybody performs it in the car, air-piano, head-bang and all."
  },
  {
    "cat": "Toys & Games",
    "diff": "easy",
    "kind": "survey",
    "q": "The board game most families say has started the biggest arguments at their table is…",
    "a": "Monopoly",
    "w": [
      "Risk",
      "Uno",
      "Clue"
    ],
    "why": "Monopoly — the only board game that comes with its own family grudges and house rules about Free Parking."
  },
  {
    "cat": "Saturday Morning",
    "diff": "easy",
    "kind": "survey",
    "q": "The cartoon most people say WAS their Saturday morning, more than any other, is…",
    "a": "Scooby-Doo",
    "w": [
      "The Jetsons",
      "He-Man and the Masters of the Universe",
      "The Care Bears"
    ],
    "why": "Scooby-Doo has been rerun into every childhood since 1969 — meddling kids across three generations."
  },
  {
    "cat": "The Dial-Up Years",
    "diff": "medium",
    "kind": "survey",
    "q": "The sound from the dial-up years that most people say they can still hear in their sleep is…",
    "a": "The modem handshake",
    "w": [
      "The 'You've got mail' voice",
      "The Windows startup chime",
      "The Nokia ringtone"
    ],
    "why": "That screech-and-static handshake is burned into a generation's dreams — usually right before someone picks up the phone."
  }
];
