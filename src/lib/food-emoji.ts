/**
 * Give every food a picture.
 *
 * The model is asked for an emoji and usually obliges, but not always — it
 * returned the literal word "bowl" for a rice bowl, which the app rendered
 * verbatim as text in the little circle. Nothing checked, because "bowl" is a
 * perfectly valid short string.
 *
 * So the model's answer is now treated as a suggestion: kept when it really is
 * an emoji, and otherwise resolved from the food's name. The table below is
 * deliberately broad, because a generic plate on half the entries makes the
 * timeline much harder to scan than it needs to be.
 */

/**
 * Does this string actually contain a pictograph?
 *
 * Extended_Pictographic covers emoji including ones outside the Emoji property,
 * and rejects plain words, which is the failure this exists to catch.
 */
export function isEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 8) return false;
  return /\p{Extended_Pictographic}/u.test(trimmed);
}

/**
 * Name fragments to emoji, most specific first.
 *
 * Order matters: "chicken sandwich" should be a sandwich, not a chicken, so
 * composite dishes are listed above their ingredients.
 */
const BY_KEYWORD: [RegExp, string][] = [
  // Composite dishes, before the ingredients they contain.
  [/\b(burrito|wrap|shawarma|gyro|kati roll|donair)\b/, "🌯"],
  [/\b(taco)\b/, "🌮"],
  [/\b(sandwich|sub|panini|bagel with|blt)\b/, "🥪"],
  [/\b(burger|cheeseburger|whopper|big mac)\b/, "🍔"],
  [/\b(pizza|calzone)\b/, "🍕"],
  [/\b(sushi|maki|nigiri)\b/, "🍣"],
  [/\b(ramen|pho|noodle soup)\b/, "🍜"],
  [/\b(pasta|spaghetti|bolognese|lasagn|penne|macaroni|mac and cheese)\b/, "🍝"],
  [/\b(curry|karahi|masala|daal|dal|tikka|korma)\b/, "🍛"],
  [/\b(biryani|pilau|pilaf|fried rice|rice bowl|poke)\b/, "🍚"],
  [/\b(salad|slaw|tabbouleh)\b/, "🥗"],
  [/\b(soup|broth|stew|chowder)\b/, "🍲"],
  [/\b(stir fry|stir-fry)\b/, "🥘"],
  [/\b(porridge|oatmeal|oats|congee|granola|cereal|muesli)\b/, "🥣"],
  [/\b(pancake|waffle|crepe)\b/, "🥞"],
  [/\b(fries|chips|wedges)\b/, "🍟"],
  [/\b(falafel|nugget|tender|popcorn chicken)\b/, "🍢"],
  [/\b(kebab|skewer|satay)\b/, "🍡"],
  [/\b(dumpling|gyoza|samosa|pierogi|momo)\b/, "🥟"],
  [/\b(burrito bowl|bowl)\b/, "🥣"],

  // Proteins.
  [/\b(chicken|turkey|poultry)\b/, "🍗"],
  [/\b(steak|beef|lamb|mutton|pork|bacon|ham|mince)\b/, "🥩"],
  [/\b(fish|salmon|tuna|cod|haddock|tilapia)\b/, "🐟"],
  [/\b(prawn|shrimp|lobster|crab)\b/, "🦐"],
  [/\b(egg|omelette|omelet|frittata)\b/, "🥚"],
  [/\b(tofu|tempeh|paneer)\b/, "🧊"],
  [/\b(protein shake|whey|protein powder)\b/, "🥤"],
  [/\b(bean|lentil|chickpea|hummus)\b/, "🫘"],

  // Carbs and bread.
  [/\b(rice)\b/, "🍚"],
  [/\b(roti|naan|chapati|paratha|pita|tortilla|flatbread)\b/, "🫓"],
  [/\b(bread|toast|baguette|sourdough|bun)\b/, "🍞"],
  [/\b(bagel)\b/, "🥯"],
  [/\b(croissant|pastry|danish)\b/, "🥐"],
  [/\b(potato|mash)\b/, "🥔"],
  [/\b(sweet potato|yam)\b/, "🍠"],
  [/\b(corn|maize)\b/, "🌽"],

  // Dairy.
  [/\b(yogurt|yoghurt|skyr|curd)\b/, "🥛"],
  [/\b(cheese|cheddar|mozzarella|feta)\b/, "🧀"],
  [/\b(milk|latte|cappuccino)\b/, "🥛"],
  [/\b(butter|ghee)\b/, "🧈"],

  // Fruit and veg.
  [/\b(apple)\b/, "🍏"],
  [/\b(banana)\b/, "🍌"],
  [/\b(orange|clementine|mandarin)\b/, "🍊"],
  [/\b(strawberr|berry|berries|raspberr)\b/, "🍓"],
  [/\b(blueberr)\b/, "🫐"],
  [/\b(grape)\b/, "🍇"],
  [/\b(mango)\b/, "🥭"],
  [/\b(watermelon|melon)\b/, "🍉"],
  [/\b(peach|nectarine)\b/, "🍑"],
  [/\b(pear)\b/, "🍐"],
  [/\b(pineapple)\b/, "🍍"],
  [/\b(avocado|guacamole)\b/, "🥑"],
  [/\b(tomato|salsa)\b/, "🍅"],
  [/\b(broccoli|greens|kale|spinach)\b/, "🥦"],
  [/\b(carrot)\b/, "🥕"],
  [/\b(cucumber|pickle|gherkin)\b/, "🥒"],
  [/\b(pepper|capsicum)\b/, "🫑"],
  [/\b(onion)\b/, "🧅"],
  [/\b(mushroom)\b/, "🍄"],
  [/\b(salad leaves|lettuce)\b/, "🥬"],

  // Snacks and sweets.
  [/\b(chocolate|brownie|cocoa)\b/, "🍫"],
  [/\b(biscuit|cookie)\b/, "🍪"],
  [/\b(cake|muffin|cupcake)\b/, "🍰"],
  [/\b(doughnut|donut)\b/, "🍩"],
  [/\b(ice cream|gelato)\b/, "🍨"],
  [/\b(nut|almond|cashew|peanut|walnut|pistachio)\b/, "🥜"],
  [/\b(crisps|popcorn)\b/, "🍿"],
  [/\b(honey|syrup|jam)\b/, "🍯"],
  [/\b(bar|flapjack)\b/, "🍫"],

  // Drinks.
  [/\b(coffee|espresso|americano)\b/, "☕"],
  [/\b(tea|chai|matcha)\b/, "🍵"],
  [/\b(water|sparkling)\b/, "💧"],
  [/\b(juice|smoothie|lemonade)\b/, "🧃"],
  [/\b(coke|cola|pepsi|soda|soft drink|fizzy|sprite|fanta)\b/, "🥤"],
  [/\b(beer|lager|ale|cider)\b/, "🍺"],
  [/\b(wine|prosecco)\b/, "🍷"],
];

/** The last resort, and the only place a generic plate should come from. */
const FALLBACK = "🍽️";

/**
 * Pick the picture for a food.
 *
 * @param name    what the food is called, used when the suggestion is unusable
 * @param suggested what the model (or a database) offered, if anything
 */
export function resolveFoodEmoji(name: string, suggested?: string): string {
  if (suggested && isEmoji(suggested)) return suggested.trim();

  const haystack = ` ${name.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ")} `;

  // People write "eggs", "almonds", "dumplings"; the table is singular. Rather
  // than pluralise eighty patterns and get some of them wrong, each name is
  // also matched with trailing plurals stripped. Both forms are tried, so
  // entries that are genuinely plural ("chips", "fries") still match directly.
  const singular = haystack.replace(/(\w)s\b/g, "$1");

  for (const [pattern, emoji] of BY_KEYWORD) {
    if (pattern.test(haystack) || pattern.test(singular)) return emoji;
  }
  return FALLBACK;
}
