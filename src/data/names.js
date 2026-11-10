// CShapes gives each state one name for its whole life ("Russia (Soviet Union)"). For labels we show
// the name in use at the clock's date. Change dates are from the Wikipedia articles on each state
// (Soviet Union, Russian Empire, Turkey, Ottoman Empire, Myanmar, Zaire, Belgian Congo, Burkina Faso,
// North Vietnam, Yemeni unification). Names without a verified change date keep the dataset's form.
const RANGES = {
  'Russia (Soviet Union)': [[-Infinity, 1917.2, 'Russian Empire'], [1917.2, 1922.99, 'Russia'], [1922.99, 1991.98, 'Soviet Union'], [1991.98, Infinity, 'Russia']],
  'Turkey (Ottoman Empire)': [[-Infinity, 1922.83, 'Ottoman Empire'], [1922.83, Infinity, 'Turkey']],
  'Myanmar (Burma)': [[-Infinity, 1989.5, 'Burma'], [1989.5, Infinity, 'Myanmar']],
  'Congo, Democratic Republic of (Zaire)': [[-Infinity, 1908.9, 'Congo Free State'], [1908.9, 1960.5, 'Belgian Congo'], [1960.5, 1971.8, 'Congo (Kinshasa)'], [1971.8, 1997.4, 'Zaire'], [1997.4, Infinity, 'DR Congo']],
  'Burkina Faso (Upper Volta)': [[-Infinity, 1984.59, 'Upper Volta'], [1984.59, Infinity, 'Burkina Faso']],
  'Vietnam, Democratic Republic of': [[-Infinity, 1976.5, 'North Vietnam'], [1976.5, Infinity, 'Vietnam']],
  'Yemen (Arab Republic of Yemen)': [[-Infinity, 1990.39, 'North Yemen'], [1990.39, Infinity, 'Yemen']],
};
const FIXED = {
  'Germany (Prussia)': 'Germany',
  'Vietnam, Republic of': 'South Vietnam',
  'Vietnam (Annam/Cochin China/Tonkin)': 'Vietnam',
  "Yemen, People's Republic of": 'South Yemen',
  "Korea, People's Republic of": 'North Korea',
  'Korea, Republic of': 'South Korea',
  'Macedonia (FYROM/North Macedonia)': 'North Macedonia',
  'Belarus (Byelorussia)': 'Belarus',
  'Madagascar (Malagasy)': 'Madagascar',
  'Cambodia (Kampuchea)': 'Cambodia',
  'British Somaliland (Somaliland Republic)': 'British Somaliland',
  'Sabah (North Borneo)': 'North Borneo',
  'West Irian (Dutch New Guinea)': 'Dutch New Guinea',
  'New Guinea (German New Guinea) (Kaiser Wilhelmsland)': 'New Guinea',
  'Kashmir (North, Azad)': 'Kashmir (disputed)',
  'Tanzania, United Republic of': 'Tanzania',
};

/** The name to show for a territory at year y. */
export function displayPolity(name, y) {
  if (!name) return name;
  const r = RANGES[name];
  if (r) for (const [a, b, n] of r) if (y >= a && y < b) return n;
  if (FIXED[name]) return FIXED[name];
  // "Name (Older name)": after 1990 only the current name is used
  if (y >= 1990 && /^[^(]+ \([^)]+\)$/.test(name)) return name.replace(/ \([^)]+\)$/, '');
  return name;
}
