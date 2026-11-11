"""Build web/prompts.json from the workshop page.

The workshop page is the source of truth for prompt text. Rerun this whenever
it changes:  python3 -I scripts/build_prompts.py [path/to/workshop.html]

Ids are positional (p01 = exercise 01), so only append exercises to the page;
renumbering it would move votes onto different prompts.
"""
import html, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path.home() / 'Downloads' / 'workshop.html'
OUT = ROOT / 'web' / 'prompts.json'
# Short, user-centred descriptions written for the leaderboard: what the prompt does
# for you, up to three things the bracket could be, and an optional one-line note.
DESCRIPTIONS = json.loads((ROOT / 'content' / 'descriptions.json').read_text(encoding='utf-8'))

# Not workshop-ready: cannot be tried as pasted in free Copilot Chat in a minute.
WHY_NOT = {
    18: 'needs a file', 19: 'needs your own task', 20: 'needs a file',
    32: 'needs your own text', 33: 'too long for a quick try', 40: 'needs your own task',
    48: 'needs a file', 49: 'needs a file', 50: 'needs a file', 51: 'needs a file',
    52: 'needs a file', 53: 'needs a file', 56: 'needs a second AI tool',
    60: 'needs your own draft', 61: 'needs your own draft', 62: 'needs your own text',
}
MULTI_TURN = {6, 7, 29, 31, 36}

# Wording changes Matt has asked for that the workshop page does not carry yet.
# html id -> [(field, text on the page, text to use)], field being 'title', 'text' or 'tip'.
# The build stops if the page text has changed, so a fix is never applied to wording
# it was not written for. Remove an entry once the workshop page has the new wording.
#
# 2026-11-10, the bracket rule: staff should only need to change a [bracket], so
# changing any one bracket alone must still leave a sensible prompt. Nothing outside
# a bracket may depend on the example inside it.
FIXES = {
    'name-it': [('text', ' Five serious, five playful, and no puns on the word "well".',
                 ' Five serious and five playful.')],
    'translate-flag': [('text', ': "The office will close at 3pm on Friday for staff training."',
                        ': [The office will close at 3pm on Friday for staff training.]'),
                       ('tip', 'Swap the language, or the sentence in quotation marks.',
                        'Swap the language, or the sentence.')],
    'bank-consequences': [('text', ' Cover staff retention, fairness and service cover.',
                           ' Cover the effect on staff, on fairness and on the service.')],
    # Matt, 10 Nov 2026: Copilot picks the three viewpoints to suit the plan, rather than fixed ones.
    'bank-three-viewpoints': [('text', ' from three viewpoints: a facilities manager, a student, and an accessibility advocate.',
                               ' from three different viewpoints. Choose the three people it would affect in the most different ways, and say who each one is.'),
                              ('tip', 'Swap the plan and the three people for your own situation.',
                               'Swap the plan for your own situation.')],
    'bank-challenge-questions': [('text', ' that challenge how we\'re defining "engaging residents".',
                                  " that challenge how I'm defining success.")],
    'bank-analogy': [('text', ' using an analogy about filing cabinets and bank vaults.',
                      ' using an everyday analogy.')],
    # 2026-11-10: "RAID" means nothing to most staff, so the title says what you get.
    'bank-raid': [('title', 'RAID Log from Rough Notes', 'Risk Log from Rough Notes')],
    # 2026-11-10: "Grounded" and "General" meant nothing even to Matt. Say what each answer is.
    'bank-dual-fact-check': [('text',
        ' First, using only sources you can link to, labelled "Grounded". Second, from your general knowledge without searching, labelled "General". Then list where the two answers disagree.',
        ' First, search the web and use only sources you can link to. Label it "From the web". Second, answer from what you already know, without searching. Label it "From memory". Then list where the two answers disagree.')],
    'limit-citations': [('text', ' about compliance notices, with their section numbers.',
                         ', with their section numbers.')],
}

# 2026-11-10, title review: a title must say what you get, with no jargon, because on
# the chart it stands alone. html id -> (title on the page, title to use).
TITLE_FIXES = {
    'bank-reading-age': ('Reading Age', 'Rewrite for a 12-Year-Old'),
    'bank-plain-summary': ('Public Summary', 'Summary for the Public'),
    'translate-flag': ('Translate and Flag', 'Translate and Flag What to Check'),
    'name-it': ('Name It', 'Ten Names for Anything'),
    'pre-mortem-quick': ('Pre-mortem', 'Pre-mortem: Why Might It Fail?'),
    'bank-trade-off': ('Trade-off Table', 'What We Gain, What It Costs'),
    'bank-stakeholder-persona': ('Stakeholder Persona', 'See It Through Their Eyes'),
    'bank-risk-audit': ('Risk Prioritisation Audit', 'Which Claims to Check First'),
    'bank-socratic': ('One Question at a Time', 'The One Question That Matters'),
    'bank-criteria': ('Weighted Criteria', 'How Should We Judge the Options?'),
    'three-levels': ('Three Levels', 'Explain It at Three Levels'),
    'bank-negative-constraints': ('Negative Constraints', 'Tell It What Not to Do'),
    'bank-exact-format': ('Exact Format', 'Lock the Output Format'),
    'sourced-briefing': ('Sourced Briefing', 'Briefing with Sources'),
    'bank-dual-fact-check': ('Grounded vs General', "Web Search vs Copilot's Memory"),
    'interview-me': ('Let It Interview You', 'Let AI Interview You'),  # Matt's wording, 2026-11-10
}
# 2026-11-10, proofread before going live. Mostly the bracket rule again (words outside
# the bracket that only fit the example inside it), plus a missing full stop, a Welsh
# name and "RAID", which the title had already dropped.
PROOFREAD = {
    'say-what-you-mean': [('text', "Here's what I want to say to a colleague: ", "Here's what I want to say: "),
                          ('text', ' that keeps my point and sets a clear deadline.', ' that keeps my point.')],
    'bank-reading-age': [('text', 'Rewrite this notice so a 12-year-old', 'Rewrite this so a 12-year-old')],
    'bank-voice-note': [('text', 'not the old ones] Remove', 'not the old ones]. Remove')],
    'bank-plain-summary': [('text', 'for the council website of this:', 'for our website of this:'),
                           ('text', ' Focus on what changes for residents.', ' Focus on what changes for the people who use our services.')],
    'bank-stakeholder-persona': [
        ('text', 'Act as the manager of a small rural community centre in Powys with two part-time staff. Here is the grant guidance: ',
         'Act as [the manager of a small rural community centre with two part-time staff]. Here is some guidance you have to follow: '),
        ('text', " Name the top three practical problems you'd face applying.", " Name the top three practical problems you'd face following it.")],
    'bank-tough-critique': [('text', 'Give a direct critique of this funding bid paragraph: ', 'Give a direct critique of this: ')],
    'bank-risk-audit': [('text', 'to a scrutiny committee: ', 'to a committee: ')],
    'instant-checklist': [('text', ' Group the steps by day.', " Group the steps in the order I'd do them.")],
    'bank-action-table': [('text', 'Sian said', 'Siân said')],
    'bank-raid': [('text', 'into a RAID log table: ', 'into a project log table: ')],
    'bank-ambiguity': [('text', 'of this brief that a contractor could misread: ', 'of this that a reader could misread: ')],
    'bank-exact-format': [('text', 'Analyse these consultation responses: ', 'Analyse these comments: ')],
    'limit-logic': [('text', 'where each officer works exactly 3 days, no officer works two days in a row, and exactly 2 officers are on every day.',
                     'where each person works exactly 3 days, nobody works two days in a row, and exactly 2 people are on every day.')],
    'limit-citations': [('title', 'Limit Test: Made-up Citations', 'Limit Test: Made-Up Citations')],
}
for _id, _fixes in PROOFREAD.items():
    FIXES.setdefault(_id, []).extend(_fixes)

for _id, (_old, _new) in TITLE_FIXES.items():
    FIXES.setdefault(_id, []).append(('title', _old, _new))


def text(fragment):
    """Text as the Copy button gives it: tags dropped, line breaks kept."""
    fragment = re.sub(r'<br\s*/?>', '\n', fragment)
    return html.unescape(re.sub(r'<[^>]+>', '', fragment)).strip()


def fixed(html_id, field, body):
    for where, old, new in FIXES.get(html_id, []):
        if where == field:
            assert body.count(old) == 1, 'FIXES[%r] %s no longer matches the page' % (html_id, field)
            body = body.replace(old, new)
    return body


def one_line(fragment):
    return re.sub(r'\s+', ' ', text(fragment))


page = SRC.read_text(encoding='utf-8')
panel = page[page.index('id="tab-exercises"'):]
# Section names that differ from the workshop draft. Matt, 10 Nov 2026: every prompt in
# this section is about a limit of AI, so the name says so.
SECTION_FIXES = {"Check the AI's work": "Learn AI's limits"}

prompts, category = [], None
for m in re.finditer(r'<div class="eyebrow"[^>]*>(.*?)</div>|<details.*?</details>', panel, re.S):
    if m.group(1) is not None:
        category = one_line(m.group(1))
        category = SECTION_FIXES.get(category, category)
        continue
    card = m.group(0)
    num = re.search(r'class="ex-num">(\d+)<', card)
    if not num:
        continue  # the "NN Prompt title" template card
    n = int(num.group(1))
    boxes = re.findall(r'(?:<h3[^>]*>(.*?)</h3>\s*)?<div class="prompt-box" id="([^"]+)"[^>]*>(.*?)</div>', card, re.S)
    note = re.search(r'<div class="exercise-note"[^>]*>(.*?)</div>', card, re.S)
    tip = re.search(r'</button>\s*(?:</div>\s*)*<p[^>]*>(.*?)</p>', card, re.S)
    prompts.append({
        'id': 'p%02d' % n,
        'title': fixed(boxes[0][1], 'title', one_line(re.search(r'<span style="flex:1;">(.*?)</span>', card, re.S).group(1))),
        'category': category,
        'application': one_line(note.group(1)) if note else '',
        'prompts': [{'html_id': b[1], 'label': one_line(b[0]), 'text': fixed(b[1], 'text', text(b[2]))} for b in boxes],
        'tip': fixed(boxes[0][1], 'tip', one_line(tip.group(1))) if tip else '',
        'ready': n not in WHY_NOT,
        'why_not': WHY_NOT.get(n, ''),
        'turns': 'multi' if n in MULTI_TURN else 'single',
    })
    short = DESCRIPTIONS.get(prompts[-1]['id'], {})
    assert len(short.get('try', [])) <= 3, 'at most three examples: %s' % prompts[-1]['id']
    prompts[-1].update(about=short.get('about', ''), examples=short.get('try', []), note=short.get('note', ''),
                       upload=short.get('upload'))

# Prompts that are not on the workshop page (adapted from the AI Discovery Sprint).
# They carry x ids so they can never collide with a workshop exercise number.
# x06 (Bedtime Story) was removed at Matt's request on 2026-11-10; do not reuse the id.
SECTIONS = []
for p in prompts:
    if p['category'] not in SECTIONS:
        SECTIONS.append(p['category'])
SECTIONS += ['Data and code', 'Just for you']
for extra in json.loads((ROOT / 'content' / 'extra-prompts.json').read_text(encoding='utf-8')):
    assert extra['category'] in SECTIONS and len(extra['try']) <= 3, extra['id']
    prompts.append({
        'id': extra['id'], 'title': extra['title'], 'category': extra['category'], 'application': '',
        'prompts': [{'html_id': extra['id'], 'label': '', 'text': extra['text']}], 'tip': '',
        'ready': True, 'why_not': '', 'turns': 'single', 'source': extra['source'],
        'about': extra['about'], 'examples': extra['try'], 'note': extra.get('note', ''), 'upload': extra.get('upload'),
    })
assert len({p['id'] for p in prompts}) == len(prompts), 'duplicate prompt id'

# Matt, 11 Nov 2026: the workshop is for all staff in any organisation (admin, research,
# lecturers, estates, HR, IT), so examples that only fit one sector are swapped for general
# ones. Applied last, to the wording as it stands after every fix above.
GENERAL = {
 "p09": [
  [
   "in plain English a customer would understand: ",
   "in plain English anyone would understand: "
  ]
 ],
 "p10": [
  [
   "[Eligible cohorts are invited to attend vaccination clinics at designated community venues; appointments may be scheduled via the online booking portal or by telephone.]",
   "[Eligible staff are invited to attend mandatory training sessions at designated venues; places may be reserved via the online booking portal or by telephone.]"
  ]
 ],
 "p15": [
  [
   "across 12 council-owned car parks",
   "across 12 of our car parks"
  ]
 ],
 "p22": [
  [
   "[making office attendance compulsory four days a week for admin staff]",
   "[making office attendance compulsory four days a week]"
  ]
 ],
 "p23": [
  [
   "[replacing council customer service desks with digital hubs]",
   "[replacing our staffed help desk with an online help centre]"
  ]
 ],
 "p25": [
  [
   "[the manager of a small rural community centre with two part-time staff]",
   "[a new member of staff in their first week]"
  ],
  [
   "[Applicants must submit audited accounts for the last three years, a 10-page project plan and 30% match funding. Applications close in four weeks and are online only.]",
   "[To claim expenses, submit form FIN-7 with itemised receipts within 30 days through the finance portal. Claims over £50 need budget-holder approval in advance.]"
  ]
 ],
 "p28": [
  [
   "[a public consultation on changes to bin collections]",
   "[a staff survey about hybrid working]"
  ]
 ],
 "p30": [
  [
   "[a new booking system for our leisure centres]",
   "[a new room booking system]"
  ]
 ],
 "p35": [
  [
   "for a non-technical committee.",
   "for a non-technical audience."
  ]
 ],
 "p38": [
  [
   "[handling a Freedom of Information request in a Welsh council]",
   "[handling a formal complaint]"
  ]
 ],
 "p39": [
  [
   "[a council rolling out hybrid working]",
   "[a team rolling out hybrid working]"
  ]
 ],
 "p45": [
  [
   "[Upgrade library computers to modern standards",
   "[Upgrade the office computers to modern standards"
  ]
 ],
 "p46": [
  [
   "[the Well-being of Future Generations (Wales) Act 2015]",
   "[the Data Protection Act 2018]"
  ]
 ],
 "p47": [
  [
   "[Buses are always late. Need a Sunday service. Fares too high for students. Love the new route 7. Please add a stop near the hospital.]",
   "[The room was too cold. Loved the guest speaker. It started late. More time for questions, please. Lunch ran out.]"
  ]
 ],
 "p55": [
  [
   "[What does the Well-being of Future Generations (Wales) Act 2015 require public bodies to do?]",
   "[What does the Equality Act 2010 require employers to do?]"
  ]
 ],
 "p58": [
  [
   "[the Welsh Language (Wales) Measure 2011]",
   "[the Equality Act 2010]"
  ]
 ],
 "p59": [
  [
   "[4 officers]",
   "[4 staff]"
  ]
 ]
}
for p in prompts:
    for old, new in GENERAL.get(p['id'], []):
        body = p['prompts'][0]['text']
        assert body.count(old) == 1, 'GENERAL[%r] no longer matches' % p['id']
        p['prompts'][0]['text'] = body.replace(old, new)
# One emoji per ready prompt, shown beside the title on the swipe cards.
EMOJI = json.loads((ROOT / 'content' / 'emoji.json').read_text(encoding='utf-8'))
for p in prompts:
    p['emoji'] = EMOJI.get(p['id'], '')
    assert p['emoji'] or not p['ready'], 'ready prompt without an emoji: %s' % p['id']
# Workshop sections first, in page order, then the two new ones.
prompts.sort(key=lambda p: SECTIONS.index(p['category']))

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(prompts, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(len(prompts), 'prompts,', sum(p['ready'] for p in prompts), 'workshop-ready ->', OUT)
