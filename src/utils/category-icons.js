const icons = {
  Electronics: 'laptop', Fashion: 'handbag', 'Home & Garden': 'house',
  Sports: 'bicycle', Books: 'book', 'Toys & Games': 'puzzle',
};

export function categoryIcon(name) {
  return Object.hasOwn(icons, name) ? icons[name] : 'tag';
}
