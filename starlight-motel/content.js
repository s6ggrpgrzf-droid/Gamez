/*CONTENT-BEGIN*/
// THE STARLIGHT MOTEL — content pack
// Names, review fragments, desk lines, and night notes the sim draws from.
// Review fragments are keyed by the satisfaction component that produced them,
// so a player reading one knows exactly which system to fix.

const CONTENT = {

  firstNames: [
    // Women
    "Wanda", "Darlene", "Peggy", "Lorene", "Marla", "Juanita", "Rosa",
    "Betty", "Carolyn", "Shirley", "Tammy", "Brenda", "Debra", "Karen",
    "Susan", "Angela", "Michelle", "Teresa", "Connie", "Anita", "Velma",
    "Ruth", "Evelyn", "Francis", "Dolores", "Margarita", "Luz", "Carmen",
    "Nancy", "Patricia", "Janet", "Barbara", "Sandra", "Kimberly",
    // Men
    "Earl", "Vernon", "Doyle", "Leland", "Curtis", "Ray", "Dale",
    "Wayne", "Travis", "Cody", "Dustin", "Garrett", "Wade", "Hank",
    "Miguel", "Jose", "Carlos", "Alejandro", "Raymond", "Walter",
    "Harold", "Eugene", "Chester", "Amos", "Silas", "Emmett", "Virgil",
    "Leroy", "Marcus", "Darnell", "Terrence", "Jerome", "Andre",
    "Kenneth", "Donald", "Ronald", "Gary", "Larry", "Steve", "Mike",
    // Younger / family travelers
    "Kayla", "Brittany", "Amber", "Heather", "Crystal", "Destiny",
    "Tyler", "Brandon", "Justin", "Kyle", "Chase", "Hunter", "Colton",
    "Cheyenne", "Sierra", "Autumn", "Brooke",
    // Elders and Route 66 tourists
    "Mildred", "Opal", "Hazel", "Walter", "Frank", "George", "Henrietta",
    "Ingrid", "Hans", "Yuki", "Kenji", "Priya", "Anouk", "Stefan",
    "Margaret", "Eleanor", "Gordon", "Nigel"
  ],

  lastNames: [
    "Henderson", "Tucker", "Boone", "Callahan", "Pruitt", "Sikes",
    "Garcia", "Martinez", "Hernandez", "Lopez", "Ramirez", "Torres",
    "Vasquez", "Reyes", "Morales", "Jimenez",
    "Proctor", "Yargee", "Tiger", "Harjo", "Fixico", "Wildcat",
    "Bear", "Kingfisher", "Stumblingbear",
    "Johnson", "Williams", "Jackson", "Harris", "Booker", "Freeman",
    "Coleman", "Washington",
    "Miller", "Davis", "Wilson", "Moore", "Taylor", "Brown", "Smith",
    "Jones", "Clark", "Lewis", "Walker", "Hall", "Allen", "Young",
    "Baker", "Nelson", "Carter", "Mitchell", "Turner", "Phillips",
    "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart",
    "Reed", "Cook", "Morgan", "Bell", "Murphy", "Bailey", "Rivera"
  ],

  reviewFragments: {

    clean: {
      bad: [
        "There was hair in the tub that did not belong to anybody in my family.",
        "The bathroom floor was sticky. Not dirty-looking, sticky. There's a difference and I know it when I feel it.",
        "Found a fast-food wrapper behind the nightstand and a sock that wasn't ours under the bed.",
        "The towels were clean once, maybe. They smelled like they'd been folded wet.",
        "Something was growing in the corner of the shower. I didn't get close enough to name it.",
        "The carpet by the door was damp and the whole room smelled like old mop water.",
        "Ashes in the ashtray of a non-smoking room. Somebody's stay got cleaned around, not cleaned.",
        "The mirror had toothpaste constellations from the last three guests.",
        "Sheet had a stain with a shape to it. Changed my whole relationship with the dark.",
        "Trash can was empty, sure. The can itself needed a bath more than I did."
      ],
      good: [
        "Room was spotless. I mean actually spotless, not motel spotless.",
        "The bathroom smelled like bleach in the good way. Somebody here takes it serious.",
        "White towels, white sheets, no mystery stains anywhere. Rare on this highway.",
        "My wife checks corners with a flashlight. This room passed, and that has happened maybe twice.",
        "You could tell the room had been cleaned by a person who'd be embarrassed to do it halfway.",
        "Fresh-smelling, everything wiped down, trash can actually empty. Little things done right.",
        "Smelled like clean laundry and nothing else. Underrated perfume.",
        "Even the grout behaved. I checked. I always check.",
        "Not a hair, not a ring, not a wrapper. Whoever cleans here has standards and a grudge against dirt.",
        "Baseboards. They cleaned the baseboards. Nobody cleans the baseboards.",
        "The ice bucket was clean enough to drink out of, and I nearly did.",
        "Smelled like a room that gets cleaned even when nobody's watching. Especially then.",
        "Not one fingerprint on the mirror. I looked. I always look."
      ]
    },

    condition: {
      bad: [
        "The AC unit rattled all night and blew warm by 2 AM. Slept on top of the covers sweating.",
        "Shower never got past lukewarm and the drain stood ankle-deep by the end of it.",
        "The bed sagged in the middle like a hammock. My back is still filing a complaint.",
        "Toilet ran every twenty minutes, all night, whether anybody used it or not.",
        "The door wouldn't latch unless you lifted it by the handle and leaned. Did not love that at midnight.",
        "Half the outlets were dead and the TV remote had one battery in it. One.",
        "Curtain rod was held up with what looked like a bent fork. The light came in at 6 AM whether we wanted it or not.",
        "The heater clanked like a toolbox in a dryer every time it kicked on.",
        "Window unit blew dust for the first hour. By the smell, it had been saving it up.",
        "The bed frame squeaked if you breathed with commitment. Sleeping light was mandatory."
      ],
      good: [
        "AC was cold and quiet, which is the whole ballgame in Oklahoma in July.",
        "Shower had real pressure and real hot water. Stood there longer than I needed to.",
        "Good firm bed. Slept straight through, and I don't sleep strange places well.",
        "Everything in the room just worked. Lights, locks, plumbing, TV. Sounds small. Isn't.",
        "The door latched with a click you could trust. Slept better for it.",
        "Water pressure like the place respects you. Hot before the mirror fogged.",
        "You can tell somebody walks these rooms and fixes things before they're broken-broken.",
        "Room's been kept up. New-ish fixtures, door shuts solid, no mystery drips.",
        "Hot water in ten seconds flat. I timed it because nobody believes me.",
        "The door shut like a car door. Solid. Slept better just for that sound.",
        "Somebody greases, tightens, and tests things here. You can feel it in every switch."
      ]
    },

    wait: {
      bad: [
        "Stood at the desk fifteen minutes ringing a bell before anybody came out of the back.",
        "Got in at 11 PM with two kids asleep in the car and check-in still took forever. One person, six parties, no hurry.",
        "They couldn't find my reservation, then found it, then the key card didn't work, twice.",
        "Line out the door at check-in and the phone ringing the whole time. Felt bad for the clerk and worse for us.",
        "Waited so long to check in my ice had melted and my patience with it.",
        "Desk was empty at 9 PM with a sign that said back in five. It was not five.",
        "One clerk, a phone glued to her ear, and a line of us studying the wallpaper.",
        "Checked in eventually. The eventually did a lot of work in that sentence.",
        "Bell on the desk had a note: ring twice. I rang four times and a dog barked somewhere."
      ],
      good: [
        "Checked in in under three minutes, key in hand, coffee pointed out. That's how you do it.",
        "Pulled in late, half asleep, and the night clerk had us in our room before the truck cooled down.",
        "No line, no fuss, no twenty questions. Just a key and a 'sleep well.'",
        "They saw the kids melting down in the car and got us checked in fast without making a show of it.",
        "Called ahead from the road and the room was ready and waiting when we rolled in.",
        "Fastest check-in I've had at any motel on this stretch, chain or otherwise.",
        "Key card worked the first try. Put it in the review because that is not normal anymore.",
        "He had the paperwork done before I'd finished saying my name. Road magic.",
        "In and out of that office in ninety seconds, with directions to food that were RIGHT."
      ]
    },

    amenities: {
      bad: [
        "Ice machine was empty by 8 PM and stayed empty. In August. In Oklahoma.",
        "The 'breakfast' was a coffee urn and a vending machine. Coffee was from the morning before, near as I could tell.",
        "Nowhere to park the rig. Ended up on the shoulder out front with the hazards off and my fingers crossed.",
        "Laundry room had two machines and both were out of order with handwritten signs going yellow.",
        "Wi-Fi reached about as far as the office door. Useless in the room.",
        "Pool was green. Not closed-with-a-sign green, just green and open, which is worse.",
        "Vending machine took my dollar and kept the chips as a souvenir.",
        "One ice scoop for the whole building, chained to the machine like a pen at the bank.",
        "The coffee station was a museum exhibit: urn, cups, and a note from Tuesday."
      ],
      good: [
        "Real parking for the truck, lit up and room to swing wide. That alone earns a stop.",
        "Coffee was on at 4:30 in the morning, hot and strong, before I even had to ask.",
        "Ice machine full, laundry room working, quarters at the desk. Set up for people who actually travel.",
        "The pool was clean and the kids burned off six hours of car in it. Worth the rate by itself.",
        "They've got a little dog run out back with bags and a light. Somebody thought about who stops here.",
        "Good water pressure, good coffee, a working ice machine. The holy trinity, all present.",
        "They keep a hose and a squeegee by the office for windshields. Nobody does that anymore.",
        "Breakfast started before dawn for the working folks. Hot, simple, and on time.",
        "Plenty of outlets where you actually need them. Charged everything, slept fine."
      ]
    },

    noise: {
      bad: [
        "Walls are paper. Heard the TV next door word for word until 1 AM, and it was the news, so I got the weather twice.",
        "Every truck that downshifted on the highway sounded like it was coming through the wall. Because it nearly was.",
        "Party in the room above us until 3. Desk didn't answer when I called down about it.",
        "The AC cycled on and off with a bang every ten minutes. Woke up every time, like a metronome made of pots.",
        "Ice machine is right outside room 4 and somebody fills a cooler at 5 AM like they're mad at it.",
        "Train at 2, train at 4, and a dog in room 9 keeping time in between.",
        "The couple in 6 had a fight, a reconciliation, and a sequel. I heard all three acts.",
        "Somebody's alarm went off at 4:30. And 4:35. And 4:40. I know because I was awake for the trilogy.",
        "Highway hum I can sleep through. The ice machine's death rattle at midnight, less so."
      ],
      good: [
        "Slept quiet. Highway's right there but the room is sealed up good and we heard none of it.",
        "Thick walls or polite neighbors, one of the two. Either way, out like a light.",
        "They put us on the quiet end away from the ice machine without being asked. Noticed and appreciated.",
        "For a place this close to the interstate it is genuinely peaceful after dark.",
        "No slamming, no TV bleed, no parking-lot opera at midnight. Just sleep.",
        "The night clerk walks the lot around 11 and settles things down. Old-school. Works.",
        "Woke up once, to nothing at all. Best sound a motel makes.",
        "They keep the loud end for the loud folks and the quiet end for the rest of us. System works.",
        "Didn't hear the room on either side all night. Whatever is in those walls, it earns its keep."
      ]
    },

    match: {
      bad: [
        "Asked for one thing at the desk. Got the opposite, with a smile.",
        "Told them what I needed. Watched them nod. Didn't happen.",
        "Wrong room for me in every way that mattered, and I said so up front.",
        "The room itself was fine — it just wasn't the room for me, and they knew it.",
        "You can tell the desk doesn't match people to rooms. First key off the hook, every time.",
        "Everything I mentioned at check-in went politely unheard.",
        "Needed the ground floor for my knee. Got the far end and a staircase's worth of walking.",
        "I said early start, quiet room. Got the room beside the ice machine and a party wall.",
        "Booked ahead and told them the whole story. Desk gave me the one room that fit none of it."
      ],
      good: [
        "They gave me exactly the room I asked for. Exactly. That never happens.",
        "The room fit like they'd read my mind at the desk.",
        "Asked for quiet, got quiet. Asked for nothing else and needed nothing else.",
        "Blackout curtains, and the room went properly dark. Slept like the road owed me.",
        "A desk to spread the maps and the laptop both. You'd be surprised how rare that is.",
        "Rainfall shower after nine hours of highway. I'd book the room again for that alone.",
        "Somebody at that desk pays attention to who is standing in front of them.",
        "The room was the one I was hoping for when I pulled in. They just knew.",
        "Right room, right end of the building. Somebody listened, and it showed all night.",
        "Phoned ahead for my old room and it was mine when I rolled in. Felt like a regular because I was treated like one.",
        "They remembered the room I liked from spring. I didn't even have to ask.",
        "Put the baby and us at the quiet end without a word of fuss. Somebody at that desk thinks."
      ]
    },

    value: {
      bad: [
        "Ninety dollars for that room is a crime with a receipt. Half that would still be generous.",
        "They raised the rate for the game weekend and lowered nothing else, including the standards.",
        "Paid chain prices for a room the chains would have condemned. Lesson learned.",
        "Extra charge for a second towel and a fee I still don't understand. Nickel-and-dimed at a place with one ice machine.",
        "For what they charged I expected hot water and a door that locks. Got neither at full price.",
        "The sign out front advertises one price and the desk quotes another. Bait, meet switch."
      ],
      good: [
        "Fair price for a clean, quiet room. Didn't feel taken, which is all I ever ask.",
        "Cheaper than the chain by the interstate and better kept. Easy math.",
        "Worth every dollar — cold AC, hot shower, real coffee, and a rate that respects a working man.",
        "Weekly rate was honest and they didn't play games when I extended. Staying another week.",
        "You get more than you pay for here, and I do not say that about motels as a rule.",
        "Game weekend and they kept the rate decent while everybody else on the strip doubled theirs. Remembered that."
      ]
    }
  },

  segmentLines: {
    trucker: [
      "Just need a room and somewhere I won't get the rig boxed in.",
      "Been driving since Tulsa. You got a shower that gets hot?",
      "Any chance of a late checkout? My hours reset at noon.",
      "Coffee early — like four AM early — that's all I ask of a place.",
      "If the lot's lit and the coffee's early, I'm a returning customer. Write that down.",
      "Shower, bed, out by four. Don't need a speech with the key."
    ],
    family: [
      "We need two beds and a pool that isn't green, that's the whole list.",
      "The kids have been in that car six hours. Please tell me check-in is quick.",
      "Do you have a room away from the highway side? The little one wakes at everything.",
      "Something on the ground floor if you've got it — I'm not hauling this cooler up stairs twice.",
      "Somewhere the kids can burn off the wiggles before bed — the pool decides it.",
      "Two beds, and if there's a room the ice machine isn't married to, that one."
    ],
    crew: [
      "We're on the job out by the highway — need four rooms, probably six weeks.",
      "Company pays weekly. Who do I talk to about a rate for the whole crew?",
      "Boots come off at the door, we keep it clean. Just need beds and hot water that holds up at 5 AM.",
      "Early starts, so quiet rooms matter more to us than anything fancy.",
      "We track mud everywhere we go. Put us where that bothers nobody.",
      "Same rooms every week if you can hold them. Crews run better on routine."
    ],
    longstay: [
      "I'm between places right now. What do you do by the month?",
      "Just me and what's in the truck. Need somewhere steady while I get sorted.",
      "I get paid every other Friday — can we work the rent around that?",
      "Not looking for much. A door that locks, my mail can come here, that's home enough for now.",
      "I cook on a hot plate and keep to myself. Just need the rate to respect that.",
      "Week to week is fine. I just need to know the door's mine while I'm sorting things."
    ],
    tourist: [
      "We've driven Route 66 from Chicago and this is the sign I wanted to photograph.",
      "Does the neon all still light? We came a long way to see it on.",
      "Any chance of one of the rooms with the little garage beside it, like the old days?",
      "We're doing the whole road slow. What's still original here — tell me everything.",
      "We collect neon signs in photographs. Yours is the one we planned the day around.",
      "Is there a room where the sign's glow comes through the curtain? That's the one I want."
    ]
  },

  nightNotes: [
    "A coyote crossed the lot at 3 AM, casual as you please.",
    "The star on the sign buzzed a little louder than usual tonight.",
    "Somebody's grandfather clock of a truck idled out at dawn, headed west.",
    "Rain threatened all evening and then thought better of it.",
    "The ice machine hummed in B-flat, same as always.",
    "A moth convention around the lamp by room 6. Well attended.",
    "Wind came up off the plains around midnight and settled the dust.",
    "One room's TV glowed blue till late. Somebody couldn't sleep either.",
    "The night clerk swears the coffee tastes better during a storm. Unverified.",
    "A train called out twice from the crossing, far off and lonesome.",
    "Heat lightning past the water tower, too far away to hear.",
    "The lot cat inspected every tire and found them acceptable."
  ]
};

/*CONTENT-END*/
