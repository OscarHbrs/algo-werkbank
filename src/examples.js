// Beispielprogramme. `inputs` füllt das Eingabefeld vor.
export const EXAMPLES = [
  {
    id: 'ggt',
    title: 'ggT (aus der Vorlesung)',
    inputs: '18 12',
    code: `DEKLARIERE a, b
LIES a EIN
LIES b EIN
SOLANGE a ≠ b:
  WENN a > b:
    SETZE a AUF a - b
  SONST:
    SETZE b AUF b - a
  ENDE WENN
ENDE SOLANGE
GIB a AUS
`,
  },
  {
    id: 'fakultaet',
    title: 'Fakultät n!',
    inputs: '10',
    code: `DEKLARIERE n, f
LIES n EIN
SETZE f AUF 1
SOLANGE n > 1:
  SETZE f AUF f * n
  SETZE n AUF n - 1
ENDE SOLANGE
GIB f AUS
`,
  },
  {
    id: 'summe',
    title: 'Summe 1 bis n',
    inputs: '100',
    code: `DEKLARIERE n, i, summe
LIES n EIN
SETZE summe AUF 0
SETZE i AUF 1
SOLANGE i < n:
  SETZE summe AUF summe + i
  SETZE i AUF i + 1
ENDE SOLANGE
SETZE summe AUF summe + n
GIB summe AUS
`,
  },
  {
    id: 'maximum',
    title: 'Maximum von drei Zahlen',
    inputs: '7 -3 12',
    code: `DEKLARIERE a, b, c, max
LIES a EIN
LIES b EIN
LIES c EIN
SETZE max AUF a
WENN b > max:
  SETZE max AUF b
ENDE WENN
WENN c > max:
  SETZE max AUF c
ENDE WENN
GIB max AUS
`,
  },
  {
    id: 'prim',
    title: 'Primzahltest (1 = prim)',
    inputs: '97',
    code: `DEKLARIERE n, t, q, rest, prim
LIES n EIN
SETZE prim AUF 1
WENN n < 2:
  SETZE prim AUF 0
ENDE WENN
SETZE t AUF 2
SOLANGE t < n:
  SETZE q AUF n / t
  SETZE q AUF q * t
  SETZE rest AUF n - q
  WENN rest = 0:
    SETZE prim AUF 0
  ENDE WENN
  SETZE t AUF t + 1
ENDE SOLANGE
GIB prim AUS
`,
  },
  {
    id: 'binaer',
    title: 'Dezimal nach binär',
    inputs: '13',
    code: `DEKLARIERE n, bin, stelle, q, rest
LIES n EIN
SETZE bin AUF 0
SETZE stelle AUF 1
SOLANGE n > 0:
  SETZE q AUF n / 2
  SETZE rest AUF q * 2
  SETZE rest AUF n - rest
  SETZE rest AUF rest * stelle
  SETZE bin AUF bin + rest
  SETZE stelle AUF stelle * 10
  SETZE n AUF q
ENDE SOLANGE
GIB bin AUS
`,
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci-Folge',
    inputs: '15',
    code: `DEKLARIERE n, a, b, neu
LIES n EIN
SETZE a AUF 0
SETZE b AUF 1
SOLANGE n > 0:
  GIB a AUS
  SETZE neu AUF a + b
  SETZE a AUF b
  SETZE b AUF neu
  SETZE n AUF n - 1
ENDE SOLANGE
`,
  },
  {
    id: 'collatz',
    title: 'Collatz-Folge',
    inputs: '27',
    code: `DEKLARIERE n, q, rest
LIES n EIN
GIB n AUS
SOLANGE n ≠ 1:
  SETZE q AUF n / 2
  SETZE rest AUF q * 2
  WENN rest = n:
    SETZE n AUF q
  SONST:
    SETZE n AUF n * 3
    SETZE n AUF n + 1
  ENDE WENN
  GIB n AUS
ENDE SOLANGE
`,
  },
];
