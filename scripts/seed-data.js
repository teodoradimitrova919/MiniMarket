// Fictional, stable demo fixtures. Never import server-side seed files into src/.
export const SEED_NAME = 'minimarket-demo-v1';
export const PROJECT_REF = 'kkcfqkwkdcqvnurbdxus';
export const demoUsers = [
  { key: 'alex', email: 'test@test.com', username: 'Alex', role: 'user' },
  { key: 'sofia', email: 'admin@admin.com', username: 'Sofia', role: 'admin' },
  { key: 'gogo', email: 'gogo@test.com', username: 'Gogo', role: 'user' },
];
export const categoryNames = ['Electronics', 'Fashion', 'Home & Garden', 'Sports', 'Books', 'Toys & Games'];

// key, owner key, category, title, description, EUR price
const products = [
  ['galaxy-a54', 'alex', 'Electronics', 'Samsung Galaxy A54', 'Unlocked 128 GB phone in good condition. Includes a charging cable and protective case.', 180],
  ['lenovo-laptop', 'alex', 'Electronics', 'Lenovo IdeaPad Laptop', '15-inch laptop with 8 GB RAM and a 256 GB SSD. Suitable for schoolwork and everyday browsing.', 350],
  ['nike-shoes', 'alex', 'Fashion', 'Nike Running Shoes', 'Grey running shoes, EU size 42. Lightly worn and freshly cleaned.', 45],
  ['office-chair', 'alex', 'Home & Garden', 'Adjustable Office Chair', 'Comfortable desk chair with adjustable height and armrests. Small mark on the backrest.', 70],
  ['mountain-bike', 'alex', 'Sports', 'Trail Mountain Bike', 'Adult mountain bike with 27.5-inch wheels and 21 gears. Recently serviced.', 220],
  ['harry-potter', 'alex', 'Books', 'Harry Potter Book Collection', 'Complete set of seven paperback novels in English. Clean pages with minor shelf wear.', 55],
  ['building-bricks', 'alex', 'Toys & Games', 'Creative Building Brick Set', 'Large mixed set of colorful building bricks with a reusable storage box. Ages six and up.', 24],
  ['desk-lamp', 'alex', 'Home & Garden', 'LED Desk Lamp', 'Compact reading lamp with adjustable brightness and a flexible neck.', 18],
  ['denim-jacket', 'sofia', 'Fashion', 'Classic Denim Jacket', 'Blue denim jacket, size M. Comfortable regular fit with no visible damage.', 32],
  ['coffee-table', 'sofia', 'Home & Garden', 'Oak-Effect Coffee Table', 'Small coffee table with a lower shelf. Easy to carry and ideal for a living room.', 48],
  ['yoga-mat', 'sofia', 'Sports', 'Yoga Mat and Blocks', 'Non-slip mat with two foam blocks and a carrying strap. Clean and ready to use.', 20],
  ['board-games', 'sofia', 'Toys & Games', 'Family Board Game Bundle', 'Three family-friendly board games with all pieces and instructions included.', 30],
  ['bluetooth-speaker', 'gogo', 'Electronics', 'Portable Bluetooth Speaker', 'Small rechargeable speaker with clear sound. Includes its USB charging cable.', 28],
  ['winter-coat', 'gogo', 'Fashion', 'Warm Winter Coat', 'Dark blue insulated coat, size L. Water-resistant outer fabric and deep pockets.', 60],
  ['garden-tools', 'gogo', 'Home & Garden', 'Garden Hand Tool Set', 'Trowel, hand fork, and pruning shears for balcony plants or a small garden.', 16],
  ['tennis-racket', 'gogo', 'Sports', 'Tennis Racket with Cover', 'Lightweight adult tennis racket, grip size 3. Good for beginners and casual play.', 38],
  ['cookbooks', 'gogo', 'Books', 'Everyday Cooking Book Set', 'Three illustrated cookbooks with quick meals, baking ideas, and seasonal recipes.', 22],
  ['wooden-puzzle', 'gogo', 'Toys & Games', 'Wooden Animal Puzzle Set', 'Four colorful wooden puzzles with sturdy pieces. Recommended for ages three and up.', 14],
];
export const listingFixtures = products.map(([key, owner, category, title, description, price], index) => ({
  key, owner, category, title, description, price,
  created_at: new Date(Date.UTC(2026, 9, 15 + index, 10)).toISOString(),
}));
export const favoriteKeys = {
  alex: ['denim-jacket', 'yoga-mat', 'bluetooth-speaker', 'cookbooks'],
  sofia: ['galaxy-a54', 'mountain-bike', 'wooden-puzzle'],
  gogo: ['lenovo-laptop', 'nike-shoes', 'office-chair', 'harry-potter', 'board-games'],
};
