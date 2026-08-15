#!/usr/bin/env python3
"""Checker voor het ELÛNA-dashboard.

Draai:      python3 verify-dashboard.py
Zelftest:   python3 verify-dashboard.py --zelftest   (bewijst dat rood ook echt rood is)

Waarom dit bestaat, 15 augustus 2026. Het dashboard toonde die dag drie fouten die er alle
drie uitzagen als een werkend dashboard:

1. De Google-spend kwam uit data.json van 23 JULI en werd als augustus-MTD gepresenteerd:
   444,88 in plaats van de werkelijke 190,81. Daardoor stond blended ROAS op 2,28x in plaats
   van 4,41x en netto per stuk op MIN 8,29 in plaats van PLUS 4,42, met "budget bevriezen"
   als advies terwijl schalen mocht. De conclusie was dus omgedraaid, niet alleen het cijfer.
2. Dezelfde grootheid stond twee keer verschillend op EEN scherm, omdat een deel van de
   tegels de btw-toggle negeerde: omzet 989 tegen 1.196, AOV 49,43 tegen 59,81, blended
   ROAS 3,45x tegen 2,85x.
3. Een periode-lengte stond hard op 14 dagen (`k==='mtd'?14`), een getal dat klopte op de dag
   dat het werd getypt en daarna elke dag verder afweek; het deelde runway en burn tegelijk.

De checks hieronder zijn geen stijlcontrole. Ze toetsen de RELATIES die deze drie fouten
onmogelijk maken, en elke check faalt HARD als hij zijn doel niet vindt: groen zonder iets
te hebben getoetst is geen groen.
"""
import re
import sys
from pathlib import Path

BASIS = Path(__file__).parent
HTML = BASIS / "index.html"

goed, fout = 0, []


def check(naam, voorwaarde, uitleg=""):
    global goed
    if voorwaarde:
        goed += 1
        print(f"  OK   {naam}")
    else:
        fout.append(f"{naam}: {uitleg}")
        print(f"  FOUT {naam}  {uitleg}")


def controleer(s):
    """Alle checks op de meegegeven HTML-tekst. Los van het lezen, zodat de zelftest
    dezelfde functie kan voeden met bewust kapotte varianten."""
    global goed, fout
    goed, fout = 0, []

    # ── 1. De btw-basis mag nooit meer per tegel verschillen ──────────────────
    # Elke drempelvergelijking op een BLENDED roas moet via beRoas() lopen. Een hard
    # getal daar betekent dat iemand weer een basis heeft vastgezet.
    check("1a beRoas() bestaat", "function beRoas()" in s,
          "zonder deze functie valt de hele basis-consistentie weg")
    check("1b beLabel() bestaat", "function beLabel()" in s)
    check("1c twee drempels expliciet", "BE_ROAS_EX" in s and "BE_ROAS_INCL" in s)

    # blended ROAS mag niet op de kale p.rev worden getoond
    # Een ROAS op de kale p.rev is INTERNE logica op incl-btw-basis en mag nooit op het scherm
    # komen. Elke zo'n plek moet daarom zijn basis expliciet dragen; zonder die markering is
    # bij de volgende wijziging niet te zien welke basis er onder zit, en dat is precies hoe
    # 3,45x en 2,85x naast elkaar op een scherm belandden.
    kale = re.findall(r"roas\s*=\s*tot\s*>\s*0\s*\?\s*p\.rev\s*/\s*tot", s)
    gemarkeerd = s.count("// BASIS: incl btw. Interne drempellogica")
    check("1d elke kale ROAS draagt zijn basis", gemarkeerd >= len(kale),
          f"{len(kale)} kale ROAS-berekeningen, {gemarkeerd} gemarkeerd; "
          "ongemarkeerd betekent dat de basis onzichtbaar is")

    # de Route-tegel: doel, omzet en ROAS op dezelfde basis
    check("1e route-tegel gebruikt bF", "const bF   = showBTW ? 1 : 1/BTW;" in s,
          "route10k negeerde de toggle en toonde altijd incl btw")
    check("1f route-doel beweegt mee", "goalShown" in s,
          "een vast doel naast een meebewegende omzet vergelijkt twee bases")

    # ── 2. Verouderde Google-data mag nooit stil als actueel gelden ───────────
    check("2a leeftijdsgrens bestaat", "GOOGLE_FB_MAX_AGE_DAYS" in s,
          "zonder grens kan juli-spend weer als augustus-MTD verschijnen")
    check("2b te oude fallback wordt overgeslagen",
          "if (GOOGLE_FB.tooOld) continue;" in s,
          "een ONTBREKEND cijfer is eerlijk, een OUD cijfer liegt")
    check("2c onvolledige spend geeft streepjes", "spendCompleet" in s,
          "bij ontbrekende Google-spend moet blended ROAS leeg blijven, niet te gunstig")

    # ── 3. Geen periode-lengte die vastgeroest is ─────────────────────────────
    check("3a MTD-lengte is de echte dag", "k==='mtd' ? Math.max(1, new Date().getDate())" in s,
          "MTD stond hard op 14 dagen")
    check("3b geen andere harde mtd-lengte", "k==='mtd'?14" not in s)

    # ── 4. Geen hardgecodeerd advies met verzonnen cijfers ────────────────────
    check("4a statische POV-kaarten weg", 'id="sam-bullets"' not in s,
          "hardgecodeerde adviezen met vaste bedragen lezen als actueel en zijn dat niet")
    check("4b geen dode pov-grid meer", 'id="pov-grid"' not in s)

    # ── 5. Structuur: de HTML moet in balans zijn ─────────────────────────────
    o, c = s.count("<div"), s.count("</div>")
    check("5a div-balans", o == c, f"{o} open tegen {c} dicht; een wees-div breekt de layout stil")

    # ── 6. Huisregels van dit account ─────────────────────────────────────────
    check("6a geen em-dash", "—" not in s, "em-dash is account-breed verboden")
    return goed, fout


def zelftest():
    """Elke check in twee richtingen: hij moet ROOD worden op precies de fout die hij
    hoort te pakken. Een injectie die niets verandert betekent dat de TEST kapot is,
    en dan faalt deze functie hard in plaats van groen te melden."""
    origineel = HTML.read_text(encoding="utf-8")
    injecties = [
        ("1d", origineel.replace(
            "const roas=tot>0?(p.rev*(showBTW?1:1/BTW))/tot:0;",
            "const roas=tot>0?p.rev/tot:0;"), "1d"),
        ("1e", origineel.replace("const bF   = showBTW ? 1 : 1/BTW;", "const bF = 1;"), "1e"),
        ("2b", origineel.replace("if (GOOGLE_FB.tooOld) continue;", "if (false) continue;"), "2b"),
        ("3a", origineel.replace(
            "k==='mtd' ? Math.max(1, new Date().getDate())", "k==='mtd' ? 14"), "3a"),
        ("4a", origineel.replace('id="richon-pov"', 'id="sam-bullets"'), "4a"),
        ("6a", origineel.replace("<title>", "<!-- — --><title>"), "6a"),
    ]
    print("== ZELFTEST, elke injectie moet zijn eigen check rood maken ==")
    alle_ok = True
    for naam, kapot, verwacht in injecties:
        if kapot == origineel:
            print(f"  FOUT injectie {naam}: veranderde NIETS aan het bestand, test is kapot")
            alle_ok = False
            continue
        _, fouten = controleer(kapot)
        geraakt = any(f.startswith(verwacht) for f in fouten)
        print(f"  {'OK  ' if geraakt else 'FOUT'} injectie {naam} -> "
              f"{'check ' + verwacht + ' werd rood' if geraakt else 'check bleef GROEN, dekt niets'}")
        if not geraakt:
            alle_ok = False
    return alle_ok


if __name__ == "__main__":
    if not HTML.exists():
        print(f"KAPOT: {HTML} niet gevonden")
        sys.exit(1)
    if "--zelftest" in sys.argv:
        ok = zelftest()
        print("\nZelftest:", "GESLAAGD" if ok else "GEFAALD")
        sys.exit(0 if ok else 1)

    print("== ELÛNA dashboard, structuurchecks ==")
    g, f = controleer(HTML.read_text(encoding="utf-8"))
    print(f"\n{g} checks groen, {len(f)} rood")
    for r in f:
        print("  ROOD:", r)
    sys.exit(1 if f else 0)
