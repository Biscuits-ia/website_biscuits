// Rehype plugin (markdown/mdx blog content) : ajoute un aria-label aux
// checkbox des listes taches GFM (`- [ ] texte`). remark-gfm rend
// <li><input type="checkbox" disabled> texte</li> sans lier le texte au
// controle -- Lighthouse (audit "label") et les lecteurs d'ecran/agents ne
// savent pas ce que la case represente.
import { visit } from 'unist-util-visit';

function collectText(node) {
  if (node.type === 'text') return node.value;
  if (!node.children) return '';
  return node.children.map(collectText).join('');
}

export default function rehypeTaskListA11y() {
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
      if (
        node.tagName !== 'input' ||
        node.properties?.type !== 'checkbox' ||
        !parent ||
        parent.type !== 'element' ||
        parent.tagName !== 'li'
      ) {
        return;
      }

      const label = parent.children
        .filter((child) => child !== node)
        .map(collectText)
        .join('')
        .trim();

      if (label) {
        node.properties['ariaLabel'] = label;
      }
    });
  };
}
