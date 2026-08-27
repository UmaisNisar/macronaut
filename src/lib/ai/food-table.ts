import type { MealSlot } from "@/lib/schemas";

/**
 * Portion-level nutrition for the foods people actually type into a tracker,
 * weighted towards South Asian, Middle Eastern and fast food since those are
 * the ones generic databases handle worst.
 *
 * Values are per `unit`. `grams` (when present) is the weight of that unit,
 * which lets the estimator scale inputs like "200g chicken".
 */
export type FoodDef = {
  id: string;
  label: string;
  emoji: string;
  /** Match keys, checked longest-first so "chicken biryani" beats "chicken". */
  aliases: string[];
  unit: string;
  grams?: number;
  kcal: number;
  p: number;
  c: number;
  f: number;
  fib?: number;
  sug?: number;
  meal?: MealSlot;
};

export const FOOD_TABLE: FoodDef[] = [
  /* ---------------------------- breakfast ---------------------------- */
  { id: "egg", label: "Egg", emoji: "🥚", aliases: ["boiled egg", "fried egg", "scrambled egg", "eggs", "egg"], unit: "1 egg", grams: 50, kcal: 78, p: 6.3, c: 0.6, f: 5.3, meal: "breakfast" },
  { id: "omelette", label: "Omelette", emoji: "🍳", aliases: ["omelette", "omelet"], unit: "1 two-egg omelette", kcal: 220, p: 14, c: 2, f: 17, meal: "breakfast" },
  { id: "toast", label: "Toast", emoji: "🍞", aliases: ["slice of bread", "slices of bread", "toast", "bread"], unit: "1 slice", grams: 32, kcal: 80, p: 3, c: 14, f: 1, fib: 1, meal: "breakfast" },
  { id: "butter", label: "Butter", emoji: "🧈", aliases: ["butter"], unit: "1 tbsp", grams: 14, kcal: 102, p: 0.1, c: 0, f: 11.5 },
  { id: "oats", label: "Oatmeal", emoji: "🥣", aliases: ["oatmeal", "porridge", "oats"], unit: "1 bowl", kcal: 150, p: 5, c: 27, f: 3, fib: 4, meal: "breakfast" },
  { id: "cereal", label: "Cereal", emoji: "🥣", aliases: ["cornflakes", "cereal"], unit: "1 bowl", kcal: 200, p: 5, c: 40, f: 3, fib: 3, sug: 12, meal: "breakfast" },
  { id: "pancake", label: "Pancake", emoji: "🥞", aliases: ["pancakes", "pancake"], unit: "1 pancake", kcal: 90, p: 2, c: 15, f: 3, meal: "breakfast" },
  { id: "croissant", label: "Croissant", emoji: "🥐", aliases: ["croissant"], unit: "1", kcal: 270, p: 6, c: 31, f: 14, meal: "breakfast" },
  { id: "bagel", label: "Bagel", emoji: "🥯", aliases: ["bagel"], unit: "1", kcal: 250, p: 10, c: 48, f: 1.5, meal: "breakfast" },
  { id: "halwapuri", label: "Halwa Puri", emoji: "🫓", aliases: ["halwa puri", "halwa poori"], unit: "1 plate", kcal: 780, p: 12, c: 96, f: 38, sug: 30, meal: "breakfast" },

  /* ------------------------------ dairy ------------------------------ */
  { id: "milk", label: "Milk", emoji: "🥛", aliases: ["glass of milk", "milk"], unit: "1 cup", kcal: 122, p: 8, c: 12, f: 4.8, sug: 12 },
  { id: "yogurt", label: "Yogurt", emoji: "🍶", aliases: ["greek yogurt", "yoghurt", "yogurt", "dahi", "curd"], unit: "1 cup", kcal: 150, p: 9, c: 17, f: 4, sug: 17 },
  { id: "cheese", label: "Cheese", emoji: "🧀", aliases: ["cheese slice", "cheese"], unit: "1 slice", grams: 20, kcal: 70, p: 4, c: 1, f: 6 },
  { id: "paneer", label: "Paneer", emoji: "🧀", aliases: ["paneer", "cottage cheese"], unit: "100 g", grams: 100, kcal: 265, p: 18, c: 1.2, f: 21 },

  /* ----------------------------- protein ----------------------------- */
  { id: "chickenbreast", label: "Chicken Breast", emoji: "🍗", aliases: ["grilled chicken breast", "chicken breast"], unit: "1 breast", grams: 150, kcal: 250, p: 46, c: 0, f: 5.5 },
  { id: "grilledchicken", label: "Grilled Chicken", emoji: "🍗", aliases: ["roast chicken", "grilled chicken", "baked chicken", "chicken"], unit: "1 serving", grams: 130, kcal: 230, p: 38, c: 2, f: 8 },
  { id: "friedchicken", label: "Fried Chicken", emoji: "🍗", aliases: ["fried chicken", "broast", "broasted chicken"], unit: "1 piece", grams: 110, kcal: 320, p: 22, c: 11, f: 21 },
  { id: "steak", label: "Steak", emoji: "🥩", aliases: ["beef steak", "steak"], unit: "1 steak", grams: 200, kcal: 460, p: 54, c: 0, f: 26 },
  { id: "beef", label: "Beef", emoji: "🥩", aliases: ["ground beef", "minced beef", "keema", "beef"], unit: "1 cup", grams: 200, kcal: 330, p: 26, c: 4, f: 23 },
  { id: "mutton", label: "Mutton", emoji: "🍖", aliases: ["mutton", "lamb", "goat"], unit: "1 serving", grams: 150, kcal: 300, p: 26, c: 0, f: 21 },
  { id: "fish", label: "Fish", emoji: "🐟", aliases: ["fish fillet", "fish"], unit: "1 fillet", grams: 150, kcal: 200, p: 30, c: 0, f: 8 },
  { id: "salmon", label: "Salmon", emoji: "🐟", aliases: ["salmon"], unit: "1 fillet", grams: 150, kcal: 280, p: 34, c: 0, f: 16 },
  { id: "prawns", label: "Prawns", emoji: "🦐", aliases: ["prawns", "shrimp"], unit: "100 g", grams: 100, kcal: 99, p: 24, c: 0.2, f: 0.3 },
  { id: "tuna", label: "Tuna", emoji: "🐟", aliases: ["canned tuna", "tuna"], unit: "1 can", grams: 140, kcal: 120, p: 26, c: 0, f: 1 },

  /* --------------------------- south asian --------------------------- */
  { id: "chickenbiryani", label: "Chicken Biryani", emoji: "🍛", aliases: ["chicken biryani", "biryani", "biriyani", "briyani"], unit: "1 plate", grams: 400, kcal: 620, p: 28, c: 78, f: 22, fib: 3, sug: 3 },
  { id: "muttonbiryani", label: "Mutton Biryani", emoji: "🍛", aliases: ["mutton biryani", "beef biryani"], unit: "1 plate", grams: 400, kcal: 700, p: 30, c: 78, f: 30, fib: 3 },
  { id: "pulao", label: "Pulao", emoji: "🍚", aliases: ["pulao", "pilaf", "pulav"], unit: "1 plate", grams: 350, kcal: 450, p: 12, c: 68, f: 14, fib: 2 },
  { id: "karahi", label: "Chicken Karahi", emoji: "🍲", aliases: ["chicken karahi", "karahi", "kadai"], unit: "1 serving", kcal: 480, p: 38, c: 10, f: 32 },
  { id: "butterchicken", label: "Butter Chicken", emoji: "🍛", aliases: ["butter chicken", "makhani", "tikka masala"], unit: "1 serving", kcal: 490, p: 32, c: 14, f: 34 },
  { id: "chickentikka", label: "Chicken Tikka", emoji: "🍢", aliases: ["chicken tikka", "tikka"], unit: "1 piece", grams: 120, kcal: 220, p: 28, c: 2, f: 11 },
  { id: "seekh", label: "Seekh Kebab", emoji: "🍢", aliases: ["seekh kebab", "kebab", "kabab"], unit: "1 skewer", kcal: 180, p: 14, c: 2, f: 13 },
  { id: "chapli", label: "Chapli Kebab", emoji: "🍔", aliases: ["chapli kebab", "chapli"], unit: "1", kcal: 300, p: 18, c: 8, f: 22 },
  { id: "nihari", label: "Nihari", emoji: "🍲", aliases: ["nihari"], unit: "1 bowl", kcal: 560, p: 35, c: 14, f: 40 },
  { id: "haleem", label: "Haleem", emoji: "🍲", aliases: ["haleem", "daleem"], unit: "1 bowl", kcal: 380, p: 22, c: 34, f: 17, fib: 6 },
  { id: "daal", label: "Daal", emoji: "🍲", aliases: ["daal", "dal", "lentils", "lentil curry"], unit: "1 bowl", kcal: 230, p: 13, c: 33, f: 4, fib: 9 },
  { id: "chana", label: "Chana Masala", emoji: "🫘", aliases: ["chana masala", "chole", "chickpea curry", "chana"], unit: "1 bowl", kcal: 280, p: 12, c: 40, f: 8, fib: 10 },
  { id: "palakpaneer", label: "Palak Paneer", emoji: "🥬", aliases: ["palak paneer", "saag paneer"], unit: "1 serving", kcal: 320, p: 14, c: 12, f: 24, fib: 5 },
  { id: "alugosht", label: "Aloo Gosht", emoji: "🍲", aliases: ["aloo gosht", "alu gosht"], unit: "1 serving", kcal: 400, p: 24, c: 20, f: 24 },
  { id: "korma", label: "Korma", emoji: "🍛", aliases: ["korma", "qorma"], unit: "1 serving", kcal: 430, p: 28, c: 14, f: 29 },
  { id: "roti", label: "Roti", emoji: "🫓", aliases: ["chapati", "chapatti", "roti", "phulka"], unit: "1 roti", grams: 45, kcal: 110, p: 3, c: 22, f: 2.5, fib: 3 },
  { id: "naan", label: "Naan", emoji: "🫓", aliases: ["garlic naan", "naan"], unit: "1 naan", grams: 90, kcal: 260, p: 8, c: 48, f: 5 },
  { id: "paratha", label: "Paratha", emoji: "🫓", aliases: ["paratha", "parantha"], unit: "1 paratha", grams: 80, kcal: 290, p: 6, c: 36, f: 14 },
  { id: "puri", label: "Puri", emoji: "🫓", aliases: ["puri", "poori"], unit: "1 puri", kcal: 140, p: 2, c: 15, f: 8 },
  { id: "samosa", label: "Samosa", emoji: "🥟", aliases: ["samosa", "samosas"], unit: "1 samosa", kcal: 260, p: 5, c: 30, f: 13, meal: "snack" },
  { id: "pakora", label: "Pakora", emoji: "🧆", aliases: ["pakora", "pakoray", "bhaji"], unit: "1 plate", kcal: 320, p: 8, c: 30, f: 19, meal: "snack" },
  { id: "rice", label: "Rice", emoji: "🍚", aliases: ["white rice", "steamed rice", "boiled rice", "rice"], unit: "1 cup cooked", grams: 158, kcal: 205, p: 4.3, c: 45, f: 0.4, fib: 0.6 },
  { id: "brownrice", label: "Brown Rice", emoji: "🍚", aliases: ["brown rice"], unit: "1 cup cooked", grams: 195, kcal: 216, p: 5, c: 45, f: 1.8, fib: 3.5 },
  { id: "raita", label: "Raita", emoji: "🥗", aliases: ["raita"], unit: "1 bowl", kcal: 90, p: 4, c: 8, f: 4 },
  { id: "gulabjamun", label: "Gulab Jamun", emoji: "🍮", aliases: ["gulab jamun", "gulab jamun"], unit: "1 piece", kcal: 150, p: 2, c: 25, f: 5, sug: 22, meal: "snack" },
  { id: "kheer", label: "Kheer", emoji: "🍚", aliases: ["kheer", "rice pudding"], unit: "1 bowl", kcal: 250, p: 6, c: 40, f: 8, sug: 32, meal: "snack" },
  { id: "jalebi", label: "Jalebi", emoji: "🍥", aliases: ["jalebi"], unit: "1 piece", kcal: 150, p: 1, c: 30, f: 4, sug: 26, meal: "snack" },
  { id: "lassi", label: "Lassi", emoji: "🥤", aliases: ["mango lassi", "lassi"], unit: "1 glass", kcal: 260, p: 9, c: 38, f: 8, sug: 34, meal: "drink" },
  { id: "chai", label: "Chai", emoji: "☕", aliases: ["doodh patti", "milk tea", "chai", "tea"], unit: "1 cup", kcal: 90, p: 3, c: 12, f: 3, sug: 11, meal: "drink" },

  /* ---------------------------- fast food ---------------------------- */
  { id: "shawarma", label: "Chicken Shawarma", emoji: "🌯", aliases: ["chicken shawarma", "shawarma", "shwarma", "shawarma wrap"], unit: "1 wrap", grams: 300, kcal: 620, p: 34, c: 56, f: 28, fib: 4 },
  { id: "beefshawarma", label: "Beef Shawarma", emoji: "🌯", aliases: ["beef shawarma"], unit: "1 wrap", kcal: 680, p: 32, c: 56, f: 36, fib: 4 },
  { id: "burger", label: "Burger", emoji: "🍔", aliases: ["cheeseburger", "hamburger", "beef burger", "burger"], unit: "1 burger", kcal: 550, p: 27, c: 42, f: 30, fib: 2 },
  { id: "zinger", label: "Zinger Burger", emoji: "🍔", aliases: ["zinger burger", "zinger", "chicken burger"], unit: "1 burger", kcal: 640, p: 30, c: 50, f: 36 },
  { id: "pizza", label: "Pizza", emoji: "🍕", aliases: ["slices of pizza", "slice of pizza", "pizza slice", "pizza"], unit: "1 slice", grams: 110, kcal: 285, p: 12, c: 36, f: 10, fib: 2 },
  { id: "fries", label: "Fries", emoji: "🍟", aliases: ["french fries", "fries", "chips"], unit: "1 medium", grams: 117, kcal: 340, p: 4, c: 44, f: 16, fib: 4 },
  { id: "nuggets", label: "Chicken Nuggets", emoji: "🍗", aliases: ["chicken nuggets", "nuggets"], unit: "6 pieces", kcal: 270, p: 14, c: 16, f: 17 },
  { id: "hotdog", label: "Hot Dog", emoji: "🌭", aliases: ["hot dog", "hotdog"], unit: "1", kcal: 290, p: 10, c: 24, f: 18 },
  { id: "clubsandwich", label: "Club Sandwich", emoji: "🥪", aliases: ["club sandwich"], unit: "1", kcal: 590, p: 30, c: 48, f: 30 },
  { id: "sandwich", label: "Sandwich", emoji: "🥪", aliases: ["sandwich", "sub"], unit: "1", kcal: 350, p: 18, c: 38, f: 14, fib: 3 },
  { id: "wrap", label: "Wrap", emoji: "🌯", aliases: ["chicken wrap", "wrap", "roll paratha", "paratha roll"], unit: "1", kcal: 450, p: 24, c: 44, f: 19 },
  { id: "sushi", label: "Sushi", emoji: "🍣", aliases: ["sushi roll", "sushi"], unit: "6 pieces", kcal: 255, p: 9, c: 38, f: 6 },
  { id: "ramen", label: "Ramen", emoji: "🍜", aliases: ["ramen"], unit: "1 bowl", kcal: 500, p: 20, c: 60, f: 18 },
  { id: "spaghetti", label: "Spaghetti Bolognese", emoji: "🍝", aliases: ["spaghetti bolognese", "spaghetti"], unit: "1 plate", kcal: 540, p: 26, c: 66, f: 18, fib: 5 },
  { id: "pasta", label: "Pasta", emoji: "🍝", aliases: ["alfredo", "pasta", "penne", "lasagna"], unit: "1 plate", kcal: 450, p: 16, c: 62, f: 14, fib: 4 },
  { id: "maccheese", label: "Mac and Cheese", emoji: "🧀", aliases: ["mac and cheese", "macaroni"], unit: "1 bowl", kcal: 480, p: 18, c: 50, f: 22 },
  { id: "friedrice", label: "Fried Rice", emoji: "🍚", aliases: ["fried rice"], unit: "1 plate", kcal: 480, p: 16, c: 68, f: 15 },
  { id: "noodles", label: "Noodles", emoji: "🍜", aliases: ["chow mein", "noodles", "chowmein"], unit: "1 plate", kcal: 430, p: 14, c: 62, f: 13 },
  { id: "taco", label: "Taco", emoji: "🌮", aliases: ["taco", "tacos"], unit: "1 taco", kcal: 210, p: 9, c: 17, f: 12 },
  { id: "burrito", label: "Burrito", emoji: "🌯", aliases: ["burrito"], unit: "1", kcal: 620, p: 26, c: 72, f: 24, fib: 8 },
  { id: "falafel", label: "Falafel", emoji: "🧆", aliases: ["falafel"], unit: "4 pieces", kcal: 230, p: 8, c: 18, f: 14, fib: 6 },
  { id: "hummus", label: "Hummus", emoji: "🫓", aliases: ["hummus"], unit: "1 serving", kcal: 180, p: 5, c: 14, f: 12, fib: 5 },
  { id: "shishtawook", label: "Shish Tawook", emoji: "🍢", aliases: ["shish tawook", "tawook"], unit: "1 serving", kcal: 320, p: 40, c: 6, f: 14 },
  { id: "soup", label: "Soup", emoji: "🥣", aliases: ["chicken corn soup", "soup"], unit: "1 bowl", kcal: 150, p: 7, c: 18, f: 5, fib: 2 },

  /* ------------------------------ drinks ----------------------------- */
  { id: "coke", label: "Coke", emoji: "🥤", aliases: ["coca cola", "pepsi", "coke", "soda", "soft drink"], unit: "1 can", kcal: 139, p: 0, c: 39, f: 0, sug: 39, meal: "drink" },
  { id: "cokezero", label: "Coke Zero", emoji: "🥤", aliases: ["coke zero", "diet coke", "pepsi max", "zero sugar"], unit: "1 can", kcal: 1, p: 0, c: 0.3, f: 0, meal: "drink" },
  { id: "juice", label: "Orange Juice", emoji: "🧃", aliases: ["orange juice", "juice"], unit: "1 glass", kcal: 112, p: 2, c: 26, f: 0.5, sug: 21, meal: "drink" },
  { id: "energydrink", label: "Energy Drink", emoji: "⚡", aliases: ["red bull", "energy drink", "monster"], unit: "1 can", kcal: 110, p: 0, c: 28, f: 0, sug: 27, meal: "drink" },
  { id: "coffee", label: "Black Coffee", emoji: "☕", aliases: ["black coffee", "espresso", "coffee"], unit: "1 cup", kcal: 5, p: 0.3, c: 0, f: 0, meal: "drink" },
  { id: "latte", label: "Latte", emoji: "☕", aliases: ["cappuccino", "latte"], unit: "1", kcal: 190, p: 10, c: 18, f: 7, sug: 17, meal: "drink" },
  { id: "proteinshake", label: "Protein Shake", emoji: "🥤", aliases: ["whey shake", "protein shake", "protein powder", "whey"], unit: "1 scoop", kcal: 130, p: 25, c: 4, f: 2, meal: "drink" },
  { id: "smoothie", label: "Smoothie", emoji: "🥤", aliases: ["smoothie"], unit: "1", kcal: 250, p: 6, c: 48, f: 3, fib: 4, sug: 38, meal: "drink" },
  { id: "milkshake", label: "Milkshake", emoji: "🥤", aliases: ["milkshake", "shake"], unit: "1", kcal: 420, p: 11, c: 62, f: 14, sug: 58, meal: "drink" },
  { id: "beer", label: "Beer", emoji: "🍺", aliases: ["beer"], unit: "1 bottle", kcal: 150, p: 1.6, c: 13, f: 0, meal: "drink" },
  { id: "water", label: "Water", emoji: "💧", aliases: ["water"], unit: "1 glass", kcal: 0, p: 0, c: 0, f: 0, meal: "drink" },

  /* ------------------------------ snacks ----------------------------- */
  { id: "crisps", label: "Crisps", emoji: "🥔", aliases: ["potato chips", "crisps", "lays"], unit: "1 bag", grams: 50, kcal: 300, p: 4, c: 30, f: 19, meal: "snack" },
  { id: "chocolate", label: "Chocolate", emoji: "🍫", aliases: ["chocolate bar", "chocolate", "snickers", "kitkat"], unit: "1 bar", grams: 45, kcal: 230, p: 3, c: 26, f: 13, sug: 24, meal: "snack" },
  { id: "biscuit", label: "Biscuit", emoji: "🍪", aliases: ["cookies", "cookie", "biscuits", "biscuit"], unit: "1", kcal: 70, p: 1, c: 9, f: 3.5, sug: 5, meal: "snack" },
  { id: "icecream", label: "Ice Cream", emoji: "🍨", aliases: ["ice cream", "gelato"], unit: "1 scoop", kcal: 140, p: 2.5, c: 17, f: 7, sug: 15, meal: "snack" },
  { id: "donut", label: "Donut", emoji: "🍩", aliases: ["doughnut", "donut"], unit: "1", kcal: 250, p: 3, c: 31, f: 14, sug: 12, meal: "snack" },
  { id: "cake", label: "Cake", emoji: "🍰", aliases: ["slice of cake", "cake", "brownie"], unit: "1 slice", kcal: 350, p: 4, c: 50, f: 15, sug: 35, meal: "snack" },
  { id: "popcorn", label: "Popcorn", emoji: "🍿", aliases: ["popcorn"], unit: "1 bowl", kcal: 120, p: 3, c: 19, f: 4, fib: 3, meal: "snack" },
  { id: "nuts", label: "Nuts", emoji: "🥜", aliases: ["almonds", "cashews", "walnuts", "nuts"], unit: "1 handful", grams: 30, kcal: 170, p: 6, c: 6, f: 15, fib: 3, meal: "snack" },
  { id: "peanutbutter", label: "Peanut Butter", emoji: "🥜", aliases: ["peanut butter"], unit: "1 tbsp", grams: 16, kcal: 94, p: 4, c: 3, f: 8, fib: 1 },
  { id: "granolabar", label: "Granola Bar", emoji: "🍫", aliases: ["granola bar", "protein bar"], unit: "1 bar", kcal: 190, p: 4, c: 29, f: 6, sug: 12, meal: "snack" },
  { id: "dates", label: "Dates", emoji: "🌴", aliases: ["dates", "khajoor"], unit: "3 dates", kcal: 200, p: 1, c: 54, f: 0, fib: 5, sug: 45, meal: "snack" },

  /* --------------------------- fruit & veg --------------------------- */
  { id: "banana", label: "Banana", emoji: "🍌", aliases: ["banana"], unit: "1 medium", grams: 118, kcal: 105, p: 1.3, c: 27, f: 0.4, fib: 3, sug: 14 },
  { id: "apple", label: "Apple", emoji: "🍎", aliases: ["apple"], unit: "1 medium", grams: 182, kcal: 95, p: 0.5, c: 25, f: 0.3, fib: 4, sug: 19 },
  { id: "orange", label: "Orange", emoji: "🍊", aliases: ["orange"], unit: "1 medium", grams: 131, kcal: 62, p: 1.2, c: 15, f: 0.2, fib: 3, sug: 12 },
  { id: "mango", label: "Mango", emoji: "🥭", aliases: ["mango"], unit: "1 whole", grams: 336, kcal: 200, p: 2.8, c: 50, f: 1.3, fib: 5, sug: 45 },
  { id: "grapes", label: "Grapes", emoji: "🍇", aliases: ["grapes"], unit: "1 cup", kcal: 104, p: 1, c: 27, f: 0.2, fib: 1.4, sug: 23 },
  { id: "watermelon", label: "Watermelon", emoji: "🍉", aliases: ["watermelon"], unit: "1 cup", kcal: 46, p: 0.9, c: 12, f: 0.2, sug: 9 },
  { id: "berries", label: "Berries", emoji: "🫐", aliases: ["strawberries", "blueberries", "berries"], unit: "1 cup", kcal: 70, p: 1, c: 17, f: 0.5, fib: 5, sug: 10 },
  { id: "avocado", label: "Avocado", emoji: "🥑", aliases: ["avocado"], unit: "1 whole", grams: 200, kcal: 240, p: 3, c: 12, f: 22, fib: 10 },
  { id: "caesarsalad", label: "Caesar Salad", emoji: "🥗", aliases: ["caesar salad"], unit: "1 bowl", kcal: 330, p: 10, c: 14, f: 26, fib: 3 },
  { id: "salad", label: "Salad", emoji: "🥗", aliases: ["green salad", "salad"], unit: "1 bowl", kcal: 120, p: 3, c: 12, f: 6, fib: 4 },
  { id: "vegetables", label: "Vegetables", emoji: "🥦", aliases: ["mixed vegetables", "broccoli", "vegetables", "veggies", "sabzi"], unit: "1 serving", kcal: 80, p: 3, c: 14, f: 1, fib: 5 },
  { id: "potato", label: "Potato", emoji: "🥔", aliases: ["baked potato", "potato"], unit: "1 medium", grams: 173, kcal: 160, p: 4, c: 37, f: 0.2, fib: 4 },
  { id: "sweetpotato", label: "Sweet Potato", emoji: "🍠", aliases: ["sweet potato"], unit: "1 medium", grams: 150, kcal: 180, p: 4, c: 41, f: 0.3, fib: 6 },
  { id: "corn", label: "Corn", emoji: "🌽", aliases: ["corn"], unit: "1 cup", kcal: 145, p: 5, c: 31, f: 2, fib: 4 },

  /* ---------------------------- condiments --------------------------- */
  { id: "oliveoil", label: "Olive Oil", emoji: "🫒", aliases: ["olive oil", "cooking oil"], unit: "1 tbsp", kcal: 119, p: 0, c: 0, f: 13.5 },
  { id: "mayo", label: "Mayonnaise", emoji: "🥄", aliases: ["mayonnaise", "mayo"], unit: "1 tbsp", kcal: 94, p: 0, c: 0.1, f: 10 },
  { id: "ketchup", label: "Ketchup", emoji: "🍅", aliases: ["ketchup"], unit: "1 tbsp", kcal: 19, p: 0, c: 5, f: 0, sug: 4 },
  { id: "honey", label: "Honey", emoji: "🍯", aliases: ["honey"], unit: "1 tbsp", kcal: 64, p: 0, c: 17, f: 0, sug: 17 },
  { id: "sugar", label: "Sugar", emoji: "🥄", aliases: ["sugar"], unit: "1 tsp", kcal: 16, p: 0, c: 4, f: 0, sug: 4 },
];

/** Aliases sorted longest-first, so specific dishes win over generic words. */
export const ALIAS_INDEX: { alias: string; food: FoodDef }[] = FOOD_TABLE.flatMap(
  (food) => food.aliases.map((alias) => ({ alias, food })),
).sort((a, b) => b.alias.length - a.alias.length);
