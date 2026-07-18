// Rehype plugin (markdown/mdx blog content) : ajoute loading="lazy" +
// decoding="async" a toutes les images de prose, et les enveloppe dans un
// <figure><figcaption> quand elles ont un alt (legende automatique, sans
// changer la syntaxe markdown standard ![alt](src)).
//
// Lazy loading = Core Web Vitals (images sous la ligne de flottaison ne
// bloquent plus le LCP). Figure/figcaption = accessibilite + SEO image
// (contexte associe visuellement, pas seulement via l'attribut alt).
import { visit } from 'unist-util-visit';

export default function rehypeLazyFigure() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'img' || !parent || index === null || index === undefined) return;

      node.properties = node.properties || {};
      node.properties.loading = 'lazy';
      node.properties.decoding = 'async';

      // Deja dans un figure (ou un lien) : ne pas doubler l'enveloppe.
      if (parent.type === 'element' && (parent.tagName === 'figure' || parent.tagName === 'a')) {
        return;
      }

      const alt = typeof node.properties.alt === 'string' ? node.properties.alt.trim() : '';
      const children = [node];
      if (alt) {
        children.push({
          type: 'element',
          tagName: 'figcaption',
          properties: {},
          children: [{ type: 'text', value: alt }],
        });
      }

      parent.children.splice(index, 1, {
        type: 'element',
        tagName: 'figure',
        properties: {},
        children,
      });
    });
  };
}
