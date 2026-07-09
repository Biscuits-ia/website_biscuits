// eslint-rules/require-auth-narrow.cjs
//
// Plugin local ESLint : impose le contrat de la garde TypeScript
// `AuthResult | AuthRedirect` (audit P4 #36).
//
// Regle : `no-unguarded-auth-result`
// Toute expression `await requireAuth/Role/Admin/Moderator/Benevole/
// Association/AuthJson/AdminJson/BenevoleJson(...)` doit etre :
//   - soit retournee directement (`return await requireX(...)`) ;
//   - soit assignee a une variable, et un `instanceof Response`
//     doit apparaitre dans les 8 lignes qui suivent (narrowing).
//
// Pourquoi cette regle en plus du type :
//   Le verrou TypeScript (marqueur AuthRedirect) empeche d'acceder aux
//   champs d'AuthResult tant que le narrowing n'a pas eu lieu. Mais dans
//   un .astro frontmatter, oublier le `if (x instanceof Response) return x;`
//   apres `const result = await requireX(Astro);` ne provoque PAS d'erreur
//   TS : la suite du code accede a `result.user` *apres* un narrowing
//   "implicite" que TypeScript n'a pas verifie (le type est bien l'union,
//   donc la verification passe par chance). La regle ESLint ratrappe ce cas
//   en exigeant la presence textuelle du `instanceof Response` juste apres.
//
// Cible : **/*.ts et le frontmatter des **/*.astro (le processor
// eslint-plugin-astro extrait le frontmatter en fichier .ts virtuel).

const AUTH_GUARD_NAMES = [
  'requireAuth',
  'requireRole',
  'requireAdmin',
  'requireModerator',
  'requireBenevole',
  'requireAssociation',
  'requireAuthJson',
  'requireAdminJson',
  'requireBenevoleJson',
];

const RULE_NAME = 'no-unguarded-auth-result';

/** Vrai si le nom de la fonction appelee est un de nos gardes. */
function isAuthGuard(calleeNode) {
  if (!calleeNode) return false;
  if (calleeNode.type === 'Identifier') {
    return AUTH_GUARD_NAMES.includes(calleeNode.name);
  }
  return false;
}

/**
 * Les gardes exportees par `src/lib/auth.ts` prennent **un seul** argument
 * (l'AstroGlobal, l'APIContext, ou un JsonAuthContext). La fonction locale
 * `requireAdmin(request, cookies)` de `src/pages/api/appointment-slots/[id].ts`
 * a la meme signature de nom mais prend 2 args : ce n'est pas notre garde,
 * c'est un helper local. Filtrer par nombre d'arguments evite ce faux
 * positif (et tout autre helper local qui reprendrait le nom).
 */
function isLibGuardCall(node) {
  return isAuthGuard(node.callee) && node.arguments.length === 1;
}

/**
 * Cherche un `instanceof Response` (ou `instanceof AuthRedirect`) dans
 * une fenetre de `windowSize` lignes a partir de `startLine` (0-based,
 * comme le numbering ESLint/ANTLR).
 *
 * Renvoie true si on en trouve au moins un.
 *
 * On accepte toute mention de `instanceof Response` dans la fenetre, pas
 * seulement celle sur la variable assignee : c'est une heuristique
 * conservative qui couvre la convention du repo (la variable assignee
 * est TOUJOURS celle testee par `instanceof Response` dans la ligne
 * qui suit). Si la fenetre contient un `instanceof Response` non lie
 * au resultat du require, c'est un faux positif acceptable -- il est
 * bien plus rare d'avoir un `instanceof Response` "decoratif" dans le
 * code que d'oublier le check.
 */
function windowContainsInstanceofResponse(sourceCode, startLine, windowSize) {
  const lines = sourceCode.lines;
  const end = Math.min(lines.length, startLine + windowSize);
  for (let i = startLine; i < end; i++) {
    if (/instanceof\s+Response\b/.test(lines[i])) return true;
  }
  return false;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require narrowing via `instanceof Response` after any await requireAuth/Admin/...() call. ' +
        'Pairs with the TypeScript `AuthRedirect` brand in src/lib/auth.ts (audit P4 #36).',
      category: 'Possible Errors',
      recommended: false,
    },
    schema: [],
    messages: {
      unguarded:
        "`{{name}}()` returns `AuthResult | AuthRedirect`. Without a subsequent `if (x instanceof Response) return x;` narrowing, the rejected branch is silently ignored and the route/page stays open. See src/lib/auth.ts header for the contract.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isLibGuardCall(node)) return;

        // On ne s'interesse qu'aux `await requireX(...)`.
        // `requireX(...)` synchrone (sans await) n'a pas le meme contrat
        // et n'est pas dans le pattern documente.
        const parent = node.parent;
        if (!parent || parent.type !== 'AwaitExpression') return;

        // Cas 1 : `return await requireX(...)` -- OK.
        const grand = parent.parent;
        if (grand && grand.type === 'ReturnStatement') return;

        // Cas 2 : `const x = await requireX(...)` -- exiger le narrowing
        // dans la fenetre qui suit.
        // Sinon (autre contexte : expression jetee, await isole au milieu
        // d'un ternaire...) : on signale aussi.
        const callLine = node.loc.start.line; // 1-based
        const windowSize = 8; // lignes
        const ok = windowContainsInstanceofResponse(
          sourceCode,
          callLine, // 0-based pour lines[]
          windowSize,
        );
        if (ok) return;

        context.report({
          node: parent,
          messageId: 'unguarded',
          data: { name: node.callee.name },
        });
      },
    };
  },
};

module.exports = {
  meta: { name: 'eslint-plugin-local-require-auth-narrow', version: '1.0.0' },
  rules: {
    [RULE_NAME]: rule,
  },
};
