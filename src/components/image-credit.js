import credits from '../data/populated-image-credits.json';

export function imageCredit(url) { return credits.find(credit => credit.imageUrl === url); }

export function createImageCredit(url) {
  const credit = imageCredit(url);
  if (!credit) return null;
  const caption = document.createElement('details');
  caption.className = 'small text-muted px-3 py-2 mb-0';
  const summary = document.createElement('summary'); summary.textContent = 'Illustrative photo · credits';
  caption.append(summary, 'Not a photo of the actual item. ');
  for (const [label, href] of [[credit.author, credit.sourceUrl], [credit.license, credit.licenseUrl]]) {
    const link = document.createElement('a'); link.textContent = label; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    caption.append(link, ' · ');
  }
  caption.append(credit.changes);
  return caption;
}
