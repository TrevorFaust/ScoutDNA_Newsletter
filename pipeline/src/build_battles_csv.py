"""Generate data/fantasy_position_battles_2026.csv from editor battle list.

Player names should match paveh (DraftDNA): rosters_2026 + fantasy_team_depth season 2026.
Run with --validate to warn on candidates missing from the DB.
"""
from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "fantasy_position_battles_2026.csv"

# Editorial input — run through apply_cascade() before writing CSV.
RAW_ROWS: list[tuple[str, str, str, str, str, str]] = [
    ("ARI", "QB", "QB1", "settled", "Jacoby Brissett", "Likely starter"),
    ("ARI", "QB", "QB2", "contested", "Carson Beck|Gardner Minshew II", "Rookie may jump Minshew if starter struggles"),
    ("ARI", "WR", "WR1", "settled", "Marvin Harrison Jr.", "WR alpha; McBride often top target"),
    ("ARI", "WR", "WR2", "settled", "Michael Wilson", "Likely WR2"),
    ("ARI", "WR", "WR3", "settled", "Kendrick Bourne", "Likely WR3"),
    ("ARI", "RB", "RB1", "settled", "Jeremiyah Love", "Rookie RB1"),
    ("ARI", "RB", "RB2", "contested", "Tyler Allgeier|Trey Benson|James Conner", "Trade/cut story possible"),
    ("ARI", "TE", "TE1", "settled", "Trey McBride", "TE volume rivals WR1"),
    ("ATL", "QB", "QB1", "settled", "Tua Tagovailoa", "Named Week 1 starter; Penix QB2"),
    ("ATL", "WR", "WR1", "settled", "Drake London", "Clear WR1"),
    ("ATL", "WR", "WR2", "contested", "Jahan Dotson|Zachariah Branch", "Dotson lean; Branch could push"),
    ("ATL", "WR", "WR3", "contested", "Zachariah Branch|Olamide Zaccheaus", "WR3 first; winner may chase WR2"),
    ("ATL", "RB", "RB1", "settled", "Bijan Robinson", "No competition"),
    ("ATL", "RB", "RB2", "settled", "Brian Robinson Jr.", "Handcuff"),
    ("ATL", "TE", "TE1", "settled", "Kyle Pitts Sr.", "May compete for WR2/3 targets"),
    ("BAL", "QB", "QB1", "settled", "Lamar Jackson", "Clear starter"),
    ("BAL", "WR", "WR1", "settled", "Zay Flowers", "Clear WR1"),
    ("BAL", "WR", "WR2", "contested", "Ja'Kobi Lane|Rashod Bateman|Elijah Sarratt", "Lane lean; rookies push Bateman"),
    ("BAL", "WR", "WR3", "contested", "Rashod Bateman|Elijah Sarratt", "Bateman vs Sarratt for WR3"),
    ("BAL", "RB", "RB1", "settled", "Derrick Henry", "Clear RB1"),
    ("BAL", "RB", "RB2", "contested", "Justice Hill|Adam Randall", "Randall could move up"),
    ("BAL", "TE", "TE1", "settled", "Mark Andrews", "Clear TE1"),
    ("BUF", "QB", "QB1", "settled", "Josh Allen", "No competition"),
    ("BUF", "WR", "WR1", "settled", "DJ Moore", "Expected WR1; monitor camp"),
    ("BUF", "WR", "WR2", "settled", "Khalil Shakir", "Likely WR2"),
    ("BUF", "WR", "WR3", "open", "Keon Coleman|Joshua Palmer|Skyler Bell", "Wide open WR3; rookie Skyler Bell"),
    ("BUF", "RB", "RB1", "settled", "James Cook", "Clear RB1"),
    ("BUF", "RB", "RB2", "contested", "Ray Davis|Ty Johnson", "Soft handcuff battle"),
    ("BUF", "TE", "TE1", "contested", "Dalton Kincaid|Dawson Knox", "1a/1b TE split"),
    ("CAR", "QB", "QB1", "settled", "Bryce Young", "Clear starter"),
    ("CAR", "WR", "WR1", "settled", "Tetairoa McMillan", "Clear WR1"),
    ("CAR", "WR", "WR2", "settled", "Jalen Coker", "Was WR2 last year"),
    ("CAR", "WR", "WR3", "contested", "Xavier Legette|Chris Brazzell II|Jimmy Horn Jr.", "Brazzell II may push WR2"),
    ("CAR", "RB", "RB1", "settled", "Chuba Hubbard", "Possible committee"),
    ("CAR", "RB", "RB2", "contested", "Jonathon Brooks|Chuba Hubbard", "Brooks split watch"),
    ("CAR", "TE", "TE1", "settled", "Tommy Tremble", "Weak TE room"),
    ("CHI", "QB", "QB1", "settled", "Caleb Williams", "Clear starter"),
    ("CHI", "WR", "WR1", "contested", "Rome Odunze|Luther Burden III", "Odunze lean WR1; Burden pushes from WR2"),
    ("CHI", "WR", "WR2", "settled", "Luther Burden III", "Slot WR2; competes up for WR1"),
    ("CHI", "WR", "WR3", "contested", "Kalif Raymond|Zavion Thomas", "Thomas may take WR3"),
    ("CHI", "RB", "RB1", "settled", "D'Andre Swift", "Clear RB1; some split with Monangai"),
    ("CHI", "RB", "RB2", "settled", "Kyle Monangai", "Premium handcuff and sneaky RB2 in a split"),
    ("CHI", "TE", "TE1", "settled", "Colston Loveland", "Clear TE1"),
    ("CIN", "QB", "QB1", "settled", "Joe Burrow", "No competition"),
    ("CIN", "WR", "WR1", "settled", "Ja'Marr Chase", "Elite WR1"),
    ("CIN", "WR", "WR2", "settled", "Tee Higgins", "Elite WR2"),
    ("CIN", "WR", "WR3", "settled", "Andrei Iosivas", "Clear WR3"),
    ("CIN", "RB", "RB1", "settled", "Chase Brown", "Clear starter"),
    ("CIN", "RB", "RB2", "contested", "Samaje Perine|Tahj Brooks", "Brooks may push handcuff"),
    ("CIN", "TE", "TE1", "settled", "Mike Gesicki", "Clear TE1"),
    ("CLE", "QB", "QB1", "settled", "Deshaun Watson", "Named starter Aug 24"),
    ("CLE", "QB", "QB3", "contested", "Dillon Gabriel|Taylen Green", "QB3 camp battle; longshots to play in 2026"),
    ("CLE", "WR", "WR1", "contested", "Jerry Jeudy|KC Concepcion", "Concepcion may win alpha"),
    ("CLE", "WR", "WR2", "contested", "Denzel Boston", "Boston pushes for WR2 after WR1 fallout"),
    ("CLE", "WR", "WR3", "contested", "Cedric Tillman|Isaiah Bond", "Tillman if healthy"),
    ("CLE", "RB", "RB1", "settled", "Quinshon Judkins", "Knee recovery watch"),
    ("CLE", "RB", "RB2", "settled", "Dylan Sampson", "Backup"),
    ("CLE", "TE", "TE1", "settled", "Harold Fannin Jr.", "Clear TE1"),
    ("DAL", "QB", "QB1", "settled", "Dak Prescott", "Clear starter"),
    ("DAL", "WR", "WR1", "settled", "CeeDee Lamb", "Clear WR1"),
    ("DAL", "WR", "WR2", "settled", "George Pickens", "Elite WR2"),
    ("DAL", "WR", "WR3", "contested", "Ryan Flournoy|KaVontae Turpin", "WR3 depth battle"),
    ("DAL", "RB", "RB1", "settled", "Javonte Williams", "Clear RB1"),
    ("DAL", "TE", "TE1", "settled", "Jake Ferguson", "Clear TE1"),
    ("DEN", "QB", "QB1", "settled", "Bo Nix", "Clear starter"),
    ("DEN", "WR", "WR1", "contested", "Courtland Sutton|Jaylen Waddle", "Loser is high-floor WR2"),
    ("DEN", "WR", "WR3", "contested", "Troy Franklin|Pat Bryant|Marvin Mims Jr.", "Three-way WR3"),
    ("DEN", "RB", "RB1", "contested", "J.K. Dobbins|RJ Harvey|Jonah Coleman", "Split backfield trio"),
    ("DEN", "TE", "TE1", "settled", "Evan Engram", "Only relevant fantasy TE"),
    ("DET", "QB", "QB1", "settled", "Jared Goff", "Clear starter"),
    ("DET", "WR", "WR1", "settled", "Amon-Ra St. Brown", "Clear WR1"),
    ("DET", "WR", "WR2", "settled", "Jameson Williams", "High-end WR2"),
    ("DET", "WR", "WR3", "settled", "Isaac TeSlaa", "WR3"),
    ("DET", "RB", "RB1", "settled", "Jahmyr Gibbs", "Clear RB1"),
    ("DET", "RB", "RB2", "settled", "Isiah Pacheco", "Split possible"),
    ("DET", "TE", "TE1", "settled", "Sam LaPorta", "WR3-level target share"),
    ("GB", "QB", "QB1", "settled", "Jordan Love", "Clear starter"),
    ("GB", "WR", "WR1", "open", "Christian Watson|Jayden Reed|Matthew Golden", "No true alpha; shared top-two"),
    ("GB", "WR", "WR2", "contested", "Jayden Reed|Matthew Golden|Christian Watson", "Golden year-two breakout watch"),
    ("GB", "RB", "RB1", "contested", "Josh Jacobs|MarShawn Lloyd|Chris Brooks|Kaleb Johnson", "Jacobs on exempt; Lloyd lean if out"),
    ("GB", "TE", "TE1", "settled", "Tucker Kraft", "WR-like TE usage"),
    ("HOU", "QB", "QB1", "settled", "C.J. Stroud", "Prove-it year"),
    ("HOU", "WR", "WR1", "settled", "Nico Collins", "Clear WR1"),
    ("HOU", "WR", "WR2", "open", "Kayshon Boutte|Tank Dell|Xavier Hutchinson|Jaylin Noel", "Higgins out ACL; Boutte acquired from NE"),
    ("HOU", "WR", "WR3", "contested", "Jared Wayne", "Bubble WR; WR2 fallout fills WR3"),
    ("HOU", "RB", "RB1", "contested", "David Montgomery|Woody Marks", "Montgomery vs Marks"),
    ("HOU", "TE", "TE1", "settled", "Dalton Schultz", "Clear TE1"),
    ("IND", "QB", "QB1", "settled", "Daniel Jones", "Clear starter; Richardson depth/injury only"),
    ("IND", "WR", "WR1", "contested", "Alec Pierce|Josh Downs", "Pierce lean WR1"),
    ("IND", "WR", "WR2", "settled", "Josh Downs", "High-volume WR2"),
    ("IND", "RB", "RB1", "settled", "Jonathan Taylor", "Clear RB1"),
    ("IND", "RB", "RB2", "settled", "DJ Giddens", "Handcuff"),
    ("IND", "TE", "TE1", "settled", "Tyler Warren", "TE volume ~ WR1/WR2"),
    ("JAX", "QB", "QB1", "settled", "Trevor Lawrence", "Clear QB1"),
    ("JAX", "WR", "WR1", "open", "Brian Thomas Jr.|Jakobi Meyers|Travis Hunter|Parker Washington", "Wide-open starting reps; no locked 1/2/3"),
    ("JAX", "RB", "RB1", "contested", "Bhayshul Tuten|Chris Rodriguez Jr.", "Rodriguez coach chemistry"),
    ("JAX", "TE", "TE1", "settled", "Brenton Strange", "Clear TE1"),
    ("KC", "QB", "QB1", "contested", "Patrick Mahomes|Justin Fields", "Fields may open year if Mahomes hurt"),
    ("KC", "WR", "WR1", "settled", "Rashee Rice", "Suspension/legal risk"),
    ("KC", "WR", "WR2", "settled", "Xavier Worthy", "WR2"),
    ("KC", "WR", "WR3", "contested", "Tyquan Thornton|Jalen Royals", "Royals year two; Thornton WR3 lean"),
    ("KC", "RB", "RB1", "settled", "Kenneth Walker III", "Heavy workload expected"),
    ("KC", "TE", "TE1", "settled", "Travis Kelce", "WR2-level volume"),
    ("LV", "QB", "QB1", "contested", "Kirk Cousins|Fernando Mendoza", "Cousins opens; Mendoza future"),
    ("LV", "WR", "WR1", "contested", "Tre Tucker|Jack Bech", "Tucker lean; Bech path to WR1"),
    ("LV", "WR", "WR2", "contested", "Jalen Nailor|Dont'e Thornton Jr.", "Nailor/Thornton chase WR2 behind Tucker"),
    ("LV", "RB", "RB1", "settled", "Ashton Jeanty", "Clear RB1; ankle sprain watch"),
    ("LV", "RB", "RB2", "settled", "Mike Washington Jr.", "Next up if Jeanty misses time"),
    ("LV", "TE", "TE1", "settled", "Brock Bowers", "WR1-level target competition"),
    ("LAC", "QB", "QB1", "settled", "Justin Herbert", "Clear QB1"),
    ("LAC", "WR", "WR1", "settled", "Ladd McConkey", "Clear WR1"),
    ("LAC", "WR", "WR2", "contested", "Quentin Johnston|Tre Harris", "WR2 battle"),
    ("LAC", "WR", "WR3", "contested", "Brenen Thompson|KeAndre Lambert-Smith", "WR3/WR4"),
    ("LAC", "RB", "RB1", "settled", "Omarion Hampton", "Clear RB1"),
    ("LAC", "RB", "RB2", "contested", "Kimani Vidal|Keaton Mitchell", "Useful RB2 in offense"),
    ("LAC", "TE", "TE1", "contested", "Oronde Gadsden|David Njoku", "Starter battle"),
    ("LAR", "QB", "QB1", "settled", "Matthew Stafford", "Ty Simpson future; no 2026 competition"),
    ("LAR", "WR", "WR1", "settled", "Puka Nacua", "Clear WR1"),
    ("LAR", "WR", "WR2", "settled", "Davante Adams", "High-tier WR2"),
    ("LAR", "WR", "WR3", "contested", "Jordan Whittington|Konata Mumpfield|CJ Daniels", "Low-volume WR3"),
    ("LAR", "RB", "RB1", "settled", "Kyren Williams", "Clear RB1"),
    ("LAR", "RB", "RB2", "settled", "Blake Corum", "Goal-line handcuff"),
    ("LAR", "TE", "TE1", "settled", "Colby Parkinson", "Low fantasy volume; Higbee/Ferguson blocking-first"),
    ("MIA", "QB", "QB1", "settled", "Malik Willis", "Named Week 1 starter; McCord backup; Ewers traded"),
    ("MIA", "WR", "WR1", "open", "Malik Washington|Chris Bell|Caleb Douglas", "Washington pushes for alpha; Bell/Douglas rookies"),
    ("MIA", "WR", "WR3", "contested", "Jalen Tolbert|Kevin Coleman Jr.", "WR3 tier after top-three fallout"),
    ("MIA", "WR", "WR5", "contested", "Tutu Atwell", "Atwell WR4/5 with WR3 fallout"),
    ("MIA", "RB", "RB1", "settled", "De'Von Achane", "Clear RB1"),
    ("MIA", "RB", "RB2", "contested", "Jaylen Wright|Ollie Gordon II", "High-capital backups"),
    ("MIA", "TE", "TE1", "settled", "Greg Dulcich", "Clear TE1"),
    ("MIN", "QB", "QB1", "contested", "Kyler Murray|J.J. McCarthy", "Murray expected starter"),
    ("MIN", "WR", "WR1", "settled", "Justin Jefferson", "Elite WR1"),
    ("MIN", "WR", "WR2", "settled", "Jordan Addison", "WR2"),
    ("MIN", "WR", "WR3", "contested", "Jauan Jennings|Tai Felton", "Felton camp push"),
    ("MIN", "RB", "RB1", "contested", "Aaron Jones Sr.|Jordan Mason", "RB1a/RB1b"),
    ("MIN", "TE", "TE1", "settled", "T.J. Hockenson", "Clear TE1"),
    ("NE", "QB", "QB1", "settled", "Drake Maye", "Clear starter"),
    ("NE", "WR", "WR1", "settled", "A.J. Brown", "New to offense"),
    ("NE", "WR", "WR2", "open", "Romeo Doubs", "Boutte traded to HOU; WR2 not locked"),
    ("NE", "RB", "RB1", "contested", "Rhamondre Stevenson|TreVeyon Henderson", "Henderson played better late"),
    ("NE", "TE", "TE1", "settled", "Hunter Henry", "Raridon 3rd round watch"),
    ("NO", "QB", "QB1", "settled", "Tyler Shough", "Clear QB1"),
    ("NO", "WR", "WR1", "settled", "Chris Olave", "Tyson hamstring ~2 months; Olave WR1"),
    ("NO", "WR", "WR2", "settled", "Jordyn Tyson", "Hamstring ~2 months; still the long-term WR2"),
    ("NO", "WR", "WR3", "contested", "Devaughn Vele|Bub Means|Bryce Lance", "WR3 battle"),
    ("NO", "RB", "RB1", "contested", "Travis Etienne Jr.|Alvin Kamara", "Etienne starter; Kamara RB2"),
    ("NO", "TE", "TE1", "settled", "Juwan Johnson", "Clear TE1"),
    ("NYG", "QB", "QB1", "settled", "Jaxson Dart", "Winston backup"),
    ("NYG", "WR", "WR1", "settled", "Malik Nabers", "Clear WR1; missed time last year"),
    ("NYG", "WR", "WR2", "contested", "Darius Slayton|Darnell Mooney|Malachi Fields", "WR2 battle; losers slot WR3"),
    ("NYG", "WR", "WR4", "contested", "Calvin Austin III", "Austin III chases WR4; WR2 fallout fills WR3"),
    ("NYG", "WR", "WR5", "open", "Odell Beckham Jr.|JuJu Smith-Schuster|Isaiah Hodgins|Jalin Hyatt", "Roster bubble; may not all make team"),
    ("NYG", "RB", "RB1", "contested", "Cam Skattebo|Tyrone Tracy Jr.|Devin Singletary", "Possible 3-back committee"),
    ("NYG", "TE", "TE1", "settled", "Isaiah Likely", "Johnson TE2"),
    ("NYJ", "QB", "QB1", "contested", "Geno Smith|Cade Klubnik|Brady Cook", "Klubnik if season sours"),
    ("NYJ", "WR", "WR1", "settled", "Garrett Wilson", "Clear WR1"),
    ("NYJ", "WR", "WR2", "contested", "Adonai Mitchell|Omar Cooper Jr.", "Cooper 1st round; chart may invert"),
    ("NYJ", "RB", "RB1", "settled", "Breece Hall", "Allen chips work"),
    ("NYJ", "RB", "RB2", "settled", "Braelon Allen", "Expanded role possible"),
    ("NYJ", "TE", "TE1", "contested", "Kenyon Sadiq|Mason Taylor", "Sadiq lean; also WR usage"),
    ("PHI", "QB", "QB1", "settled", "Jalen Hurts", "Clear QB1"),
    ("PHI", "WR", "WR1", "settled", "DeVonta Smith", "Clear WR1 after Brown to NE"),
    ("PHI", "WR", "WR2", "settled", "Makai Lemon", "WR2"),
    ("PHI", "WR", "WR3", "contested", "Dontayvion Wicks|Hollywood Brown", "WR3/4"),
    ("PHI", "RB", "RB1", "settled", "Saquon Barkley", "Clear RB1"),
    ("PHI", "TE", "TE1", "contested", "Dallas Goedert|Eli Stowers", "TE volume ~ WR3/4"),
    ("PIT", "QB", "QB1", "settled", "Aaron Rodgers", "Clear QB1"),
    ("PIT", "QB", "QB2", "contested", "Will Howard|Drew Allar", "Developmental future; Rudolph chart QB2"),
    ("PIT", "WR", "WR1", "settled", "DK Metcalf", "Clear WR1"),
    ("PIT", "WR", "WR2", "settled", "Michael Pittman Jr.", "Likely WR2"),
    ("PIT", "WR", "WR3", "contested", "Germie Bernard|Roman Wilson", "Bernard may chase WR2 if wins"),
    ("PIT", "RB", "RB1", "settled", "Jaylen Warren", "Clear RB1"),
    ("PIT", "RB", "RB2", "contested", "Rico Dowdle|Kaleb Johnson", "Dowdle change-of-pace"),
    ("PIT", "TE", "TE1", "settled", "Pat Freiermuth", "Washington hybrid TE2/OL"),
    ("SF", "QB", "QB1", "settled", "Brock Purdy", "Mac Jones QB2"),
    ("SF", "WR", "WR1", "contested", "Mike Evans|De'Zhaun Stribling", "Pearsall out for season; Stribling camp lean vs Evans"),
    ("SF", "WR", "WR2", "contested", "Christian Kirk", "Kirk fights for WR2 after WR1 fallout"),
    ("SF", "RB", "RB1", "settled", "Christian McCaffrey", "Clear RB1"),
    ("SF", "RB", "RB2", "contested", "Jordan James|Kaelon Black|Isaac Guerendo", "Premium handcuff"),
    ("SF", "TE", "TE1", "settled", "George Kittle", "Clear TE1"),
    ("SEA", "QB", "QB1", "settled", "Sam Darnold", "Clear starter"),
    ("SEA", "QB", "QB2", "contested", "Drew Lock|Jalen Milroe", "Future starter pipeline"),
    ("SEA", "WR", "WR1", "settled", "Jaxon Smith-Njigba", "Clear WR1"),
    ("SEA", "WR", "WR2", "open", "Cooper Kupp|Rashid Shaheed|Tory Horton", "WR2/3/4 battle behind JSN"),
    ("SEA", "RB", "RB1", "settled", "Jadarian Price", "Charbonnet on PUP/ACL; Price clear early RB1"),
    ("SEA", "TE", "TE1", "settled", "AJ Barner", "Clear TE1"),
    ("TB", "QB", "QB1", "settled", "Baker Mayfield", "Clear QB1"),
    ("TB", "WR", "WR1", "contested", "Chris Godwin Jr.|Emeka Egbuka", "Egbuka may be true WR1"),
    ("TB", "WR", "WR3", "contested", "Jalen McMillan|Tez Johnson|Ted Hurst", "Hurst 3rd round upside"),
    ("TB", "RB", "RB1", "settled", "Bucky Irving", "Likely RB1; Gainwell signed as complement"),
    ("TB", "RB", "RB2", "settled", "Kenneth Gainwell", "Signed as Bucky complement (pass/change-of-pace), not a challenger"),
    ("TB", "TE", "TE1", "settled", "Cade Otton", "Clear TE1"),
    ("TEN", "QB", "QB1", "settled", "Cam Ward", "Year two with Daboll"),
    ("TEN", "WR", "WR1", "settled", "Carnell Tate", "4th overall pick"),
    ("TEN", "WR", "WR2", "settled", "Wan'Dale Robinson", "FA add"),
    ("TEN", "WR", "WR3", "contested", "Calvin Ridley|Elic Ayomanor", "Ayomanor year two"),
    ("TEN", "RB", "RB1", "contested", "Tony Pollard|Tyjae Spears|Nicholas Singleton", "Singleton sneaky push"),
    ("TEN", "TE", "TE1", "settled", "Gunnar Helm", "Ward connection"),
    ("WAS", "QB", "QB1", "settled", "Jayden Daniels", "Mariota insurance"),
    ("WAS", "WR", "WR1", "settled", "Terry McLaurin", "Clear WR1"),
    ("WAS", "WR", "WR2", "settled", "Stefon Diggs", "Signed; presumed WR2"),
    ("WAS", "WR", "WR3", "contested", "Luke McCaffrey|Antonio Williams", "WR3 battle after Diggs"),
    ("WAS", "WR", "WR4", "open", "Jaylin Lane", "WR4 pool after WR3 fallout"),
    ("WAS", "RB", "RB1", "contested", "Jacory Croskey-Merritt|Rachaad White", "Committee history"),
    ("WAS", "RB", "RB2", "contested", "Kaytron Allen", "Allen 6th round; White cascades from RB1"),
    ("WAS", "TE", "TE1", "settled", "Chig Okonkwo", "Clear TE1"),
]


BATTLE_STATUSES = frozenset({"contested", "open"})
CASCADE_POSITIONS = frozenset({"WR", "RB", "TE", "QB"})


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _slot_num(slot: str) -> int:
    return int(re.sub(r"\D", "", slot) or 0)


def _split_candidates(raw: str) -> list[str]:
    return [c.strip() for c in raw.split("|") if c.strip()]


def _join_candidates(names: list[str]) -> str:
    return "|".join(names)


def _consecutive_dual_players(
    group: list[tuple[str, str, str, str, str, str]],
) -> set[str]:
    """Players listed in two consecutive raw battle rows (explicit multi-tier fight)."""
    dual: set[str] = set()
    prev: set[str] = set()
    prev_was_battle = False
    for *_head, status, candidates, _note in group:
        names = set(_split_candidates(candidates))
        if status in BATTLE_STATUSES and names:
            if prev_was_battle:
                dual |= prev & names
            prev = names
            prev_was_battle = True
        else:
            prev = set()
            prev_was_battle = False
    return dual


def apply_cascade(rows: list[tuple[str, str, str, str, str, str]]) -> list[tuple[str, str, str, str, str, str]]:
    """Losers from a battle fill the next slot implicitly; skip redundant lower-tier rows.

    Slot labels may gap (WR1, WR2, WR4) when WR3 is filled by cascade losers.
    Players stay in multiple battle rows only when the lower row adds new candidates
    (dual-tier fight). Settled rows that name a single player from the prior battle
    keep the chart slot (e.g. Burden WR2 while pushing for WR1).
    """
    from collections import defaultdict

    groups: dict[tuple[str, str], list[tuple[str, str, str, str, str, str]]] = defaultdict(list)
    order: list[tuple[str, str]] = []
    for row in rows:
        key = (row[0], row[1])
        if key not in groups:
            order.append(key)
        groups[key].append(row)

    out: list[tuple[str, str, str, str, str, str]] = []
    for key in order:
        team, pos = key
        group = sorted(groups[key], key=lambda r: _slot_num(r[2]))
        if pos not in CASCADE_POSITIONS:
            out.extend(group)
            continue
        dual = _consecutive_dual_players(group)
        out.extend(_cascade_group(team, pos, group, dual))
    return out


def _append_loser_note(note: str, pos: str, loser_slot: int) -> str:
    tag = f"losers slot {pos}{loser_slot}"
    if tag.lower() in note.lower():
        return note
    return f"{note}; {tag}" if note else tag


def _cascade_group(
    team: str,
    pos: str,
    group: list[tuple[str, str, str, str, str, str]],
    dual_players: set[str],
) -> list[tuple[str, str, str, str, str, str]]:
    result: list[tuple[str, str, str, str, str, str]] = []
    next_slot = 1
    prev_contested = False
    prev_pool: set[str] = set()

    for _team, position, _slot, status, candidates, note in group:
        names = _split_candidates(candidates)

        if status == "settled":
            if prev_contested and len(names) == 1 and names[0] in prev_pool:
                slot_num = next_slot - 1
            else:
                slot_num = next_slot
            result.append(
                (
                    team,
                    position,
                    f"{pos}{slot_num}",
                    status,
                    _join_candidates(names),
                    note,
                )
            )
            next_slot = slot_num + 1
            prev_contested = False
            prev_pool = set()
            continue

        if status not in BATTLE_STATUSES:
            result.append((team, position, f"{pos}{next_slot}", status, candidates, note))
            next_slot += 1
            prev_contested = False
            prev_pool = set()
            continue

        if prev_contested and names and set(names).issubset(prev_pool):
            continue

        if prev_contested and names:
            new_names = [n for n in names if n not in prev_pool]
            dual_keep = [n for n in names if n in prev_pool and n in dual_players]
            if new_names or dual_keep:
                names = new_names + dual_keep
            else:
                continue

        slot_num = next_slot
        battle_note = note
        if len(names) >= 2:
            battle_note = _append_loser_note(battle_note, pos, slot_num + 1)
            next_slot = slot_num + 2
            prev_contested = True
            prev_pool = set(names)
        else:
            next_slot = slot_num + 1
            prev_contested = False
            prev_pool = set()

        result.append(
            (
                team,
                position,
                f"{pos}{slot_num}",
                status,
                _join_candidates(names),
                battle_note,
            )
        )

    return result


def _fetch_all_rosters(sb) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        batch = (
            sb.table("rosters_2026")
            .select("full_name,team_abbr")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def _paveh_player_index() -> dict[str, set[str]]:
    """team_abbr -> normalized player names from paveh."""
    from .db import get_client

    sb = get_client()
    by_team: dict[str, set[str]] = {}
    team_alias = {"AZ": "ARI"}
    for row in _fetch_all_rosters(sb):
        team = row.get("team_abbr")
        name = (row.get("full_name") or "").strip()
        if team and name:
            canon = team_alias.get(team, team)
            by_team.setdefault(canon, set()).add(_norm(name))
    for row in (
        sb.table("fantasy_team_depth")
        .select("player_name,team_abbr")
        .eq("season", 2026)
        .execute()
        .data
        or []
    ):
        team = row.get("team_abbr")
        name = (row.get("player_name") or "").strip()
        if team and name:
            by_team.setdefault(team, set()).add(_norm(name))
    return by_team


def validate_candidates() -> list[str]:
    index = _paveh_player_index()
    warnings: list[str] = []
    for team, _pos, slot, _status, candidates, _note in apply_cascade(RAW_ROWS):
        if not candidates:
            continue
        roster = index.get(team, set())
        for raw in candidates.split("|"):
            name = raw.strip()
            if not name:
                continue
            if _norm(name) not in roster:
                warnings.append(f"{team} {slot}: {name!r} not in paveh rosters/depth")
    return warnings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--validate", action="store_true", help="Check names against paveh DB")
    args = parser.parse_args()

    rows = apply_cascade(RAW_ROWS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["team_abbr", "position", "slot", "status", "candidates", "note"])
        for row in rows:
            w.writerow(row)
    print(f"Wrote {len(rows)} rows to {OUT} (from {len(RAW_ROWS)} editorial rows)")

    if args.validate:
        warnings = validate_candidates()
        if warnings:
            print(f"\n{len(warnings)} name warning(s):")
            for w in warnings:
                print(f"  - {w}")
        else:
            print("All candidates found in paveh.")


if __name__ == "__main__":
    main()
